/**
 * WDK Wallet Manager
 * Wraps Tether WDK for EVM wallet derivation, USDT transfers, and balance queries.
 * Each agent gets a deterministic wallet derived from a shared seed + DID index.
 *
 * Uses @tetherto/wdk + @tetherto/wdk-wallet-evm for real operations,
 * with ethers.js HD derivation for address generation and mock mode.
 */

import { ethers } from 'ethers';
import type { WalletInfo, TransferResult } from '../types.js';

export interface WDKWalletConfig {
  seedPhrase: string;
  rpcUrl: string;
  usdtContractAddress: string;
  chainId: number;
}

/**
 * WDKWalletManager — Production wallet manager using Tether WDK.
 *
 * Real mode: Uses `@tetherto/wdk` with `WalletManagerEvm` for on-chain operations.
 * The WDK is initialized lazily on first use to support both real and mock flows.
 *
 * Derivation path: m/44'/60'/0'/0/{didIndex} (BIP-44 standard for EVM)
 */
export class WDKWalletManager {
  protected config: WDKWalletConfig;
  private hdWallets: Map<number, ethers.HDNodeWallet> = new Map();
  private wdkInstance: any = null;
  private wdkInitialized = false;

  constructor(config: WDKWalletConfig) {
    this.config = config;
  }

  /**
   * Initialize the Tether WDK instance lazily.
   * Uses dynamic import so the module is optional for mock/test flows.
   */
  private async initWDK(): Promise<any> {
    if (this.wdkInitialized) return this.wdkInstance;

    try {
      const { default: WDK } = await import('@tetherto/wdk');
      const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');

      this.wdkInstance = new WDK(this.config.seedPhrase)
        .registerWallet('evm', WalletManagerEvm, {
          provider: this.config.rpcUrl,
        });
      this.wdkInitialized = true;
      return this.wdkInstance;
    } catch {
      // WDK not available — fall back to ethers.js
      this.wdkInitialized = true;
      return null;
    }
  }

  /**
   * Get the ethers HD wallet for address derivation (always available).
   * Path: m/44'/60'/0'/0/{didIndex}
   */
  protected getHDWallet(didIndex: number): ethers.HDNodeWallet {
    if (this.hdWallets.has(didIndex)) {
      return this.hdWallets.get(didIndex)!;
    }
    const hdNode = ethers.HDNodeWallet.fromPhrase(
      this.config.seedPhrase,
      undefined,
      `m/44'/60'/0'/0/${didIndex}`,
    );
    this.hdWallets.set(didIndex, hdNode);
    return hdNode;
  }

  /**
   * Get the EVM address for an agent.
   */
  getAgentAddress(didIndex: number): string {
    return this.getHDWallet(didIndex).address;
  }

  /**
   * Query USDT balance for an agent wallet via WDK.
   */
  async getUSDTBalance(didIndex: number): Promise<bigint> {
    const wdk = await this.initWDK();
    if (wdk) {
      try {
        const account = await wdk.getAccount('evm', didIndex);
        const balance = await account.getTokenBalance(this.config.usdtContractAddress);
        return BigInt(balance);
      } catch {
        // fallback to ethers
      }
    }

    // Ethers.js fallback
    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    const usdt = new ethers.Contract(
      this.config.usdtContractAddress,
      ['function balanceOf(address) view returns (uint256)'],
      provider,
    );
    const balance = await usdt.balanceOf(this.getAgentAddress(didIndex));
    return BigInt(balance);
  }

  /**
   * Query native token (ETH/MATIC) balance.
   */
  async getNativeBalance(didIndex: number): Promise<bigint> {
    const wdk = await this.initWDK();
    if (wdk) {
      try {
        const account = await wdk.getAccount('evm', didIndex);
        const balance = await account.getBalance();
        return BigInt(balance);
      } catch {
        // fallback to ethers
      }
    }

    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    return provider.getBalance(this.getAgentAddress(didIndex));
  }

  /**
   * Get full wallet info (address + balances).
   */
  async getWalletInfo(didIndex: number): Promise<WalletInfo> {
    const address = this.getAgentAddress(didIndex);
    try {
      const [usdtBalance, nativeBalance] = await Promise.all([
        this.getUSDTBalance(didIndex),
        this.getNativeBalance(didIndex),
      ]);
      return { address, usdtBalance, nativeBalance };
    } catch {
      return { address, usdtBalance: 0n, nativeBalance: 0n };
    }
  }

  /**
   * Send USDT from one agent wallet to an address.
   * This is the core A2A (Agent-to-Agent) transfer mechanism.
   *
   * Uses WDK account.transfer() which handles ERC-20 transfers natively.
   */
  async sendUSDT(fromDidIndex: number, to: string, amount: bigint): Promise<TransferResult> {
    const fromAddress = this.getAgentAddress(fromDidIndex);
    const wdk = await this.initWDK();

    if (wdk) {
      try {
        const account = await wdk.getAccount('evm', fromDidIndex);
        const result = await account.transfer({
          token: this.config.usdtContractAddress,
          recipient: to,
          amount,
        });
        return {
          txHash: result.hash,
          from: fromAddress,
          to,
          amount,
          token: 'USDT',
        };
      } catch {
        // fallback to ethers
      }
    }

    // Ethers.js fallback
    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    const wallet = this.getHDWallet(fromDidIndex).connect(provider);
    const usdt = new ethers.Contract(
      this.config.usdtContractAddress,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      wallet,
    );
    const tx = await usdt.transfer(to, amount);
    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      from: fromAddress,
      to,
      amount,
      token: 'USDT',
    };
  }

  /**
   * Send native tokens from one agent wallet.
   */
  async sendNative(fromDidIndex: number, to: string, amount: bigint): Promise<TransferResult> {
    const fromAddress = this.getAgentAddress(fromDidIndex);
    const wdk = await this.initWDK();

    if (wdk) {
      try {
        const account = await wdk.getAccount('evm', fromDidIndex);
        const result = await account.sendTransaction({ to, value: amount });
        return {
          txHash: result.hash,
          from: fromAddress,
          to,
          amount,
          token: 'NATIVE',
        };
      } catch {
        // fallback to ethers
      }
    }

    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    const wallet = this.getHDWallet(fromDidIndex).connect(provider);
    const tx = await wallet.sendTransaction({ to, value: amount });
    const receipt = await tx.wait();

    return {
      txHash: receipt!.hash,
      from: fromAddress,
      to,
      amount,
      token: 'NATIVE',
    };
  }

  /**
   * Generate a random seed phrase (WDK-compatible BIP-39).
   */
  static generateSeedPhrase(): string {
    return ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(16));
  }

  /**
   * Validate a seed phrase.
   */
  static isValidSeedPhrase(phrase: string): boolean {
    try {
      ethers.Mnemonic.fromPhrase(phrase);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * MockWDKWalletManager for testing without network access.
 * Simulates wallet operations with in-memory balances.
 */
export class MockWDKWalletManager extends WDKWalletManager {
  private mockBalances: Map<string, bigint> = new Map();
  private mockNativeBalances: Map<string, bigint> = new Map();
  private transferLog: TransferResult[] = [];

  constructor(seedPhrase?: string) {
    super({
      seedPhrase: seedPhrase || 'test test test test test test test test test test test junk',
      rpcUrl: 'http://localhost:8545',
      usdtContractAddress: '0x0000000000000000000000000000000000000001',
      chainId: 31337,
    });
  }

  setMockBalance(didIndex: number, usdtBalance: bigint, nativeBalance?: bigint): void {
    const address = this.getAgentAddress(didIndex);
    this.mockBalances.set(address, usdtBalance);
    if (nativeBalance !== undefined) {
      this.mockNativeBalances.set(address, nativeBalance);
    }
  }

  override async getUSDTBalance(didIndex: number): Promise<bigint> {
    const address = this.getAgentAddress(didIndex);
    return this.mockBalances.get(address) ?? 0n;
  }

  override async getNativeBalance(didIndex: number): Promise<bigint> {
    const address = this.getAgentAddress(didIndex);
    return this.mockNativeBalances.get(address) ?? 0n;
  }

  override async sendUSDT(fromDidIndex: number, to: string, amount: bigint): Promise<TransferResult> {
    const fromAddress = this.getAgentAddress(fromDidIndex);
    const fromBalance = this.mockBalances.get(fromAddress) ?? 0n;

    if (fromBalance < amount) {
      throw new Error(`Insufficient USDT balance: has ${fromBalance}, needs ${amount}`);
    }

    this.mockBalances.set(fromAddress, fromBalance - amount);
    const toBalance = this.mockBalances.get(to) ?? 0n;
    this.mockBalances.set(to, toBalance + amount);

    const result: TransferResult = {
      txHash: `0x${Date.now().toString(16).padStart(64, '0')}`,
      from: fromAddress,
      to,
      amount,
      token: 'USDT',
    };
    this.transferLog.push(result);
    return result;
  }

  override async sendNative(fromDidIndex: number, to: string, amount: bigint): Promise<TransferResult> {
    const fromAddress = this.getAgentAddress(fromDidIndex);
    const fromBalance = this.mockNativeBalances.get(fromAddress) ?? 0n;

    if (fromBalance < amount) {
      throw new Error(`Insufficient native balance: has ${fromBalance}, needs ${amount}`);
    }

    this.mockNativeBalances.set(fromAddress, fromBalance - amount);
    const toBalance = this.mockNativeBalances.get(to) ?? 0n;
    this.mockNativeBalances.set(to, toBalance + amount);

    const result: TransferResult = {
      txHash: `0x${Date.now().toString(16).padStart(64, '0')}`,
      from: fromAddress,
      to,
      amount,
      token: 'NATIVE',
    };
    this.transferLog.push(result);
    return result;
  }

  getTransferLog(): TransferResult[] {
    return [...this.transferLog];
  }

  getMockBalance(address: string): bigint {
    return this.mockBalances.get(address) ?? 0n;
  }
}
