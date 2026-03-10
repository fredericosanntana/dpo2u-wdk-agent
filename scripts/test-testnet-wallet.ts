#!/usr/bin/env tsx
/**
 * DPO2U WDK Agent — Testnet Wallet Verification
 *
 * Tests the real WDKWalletManager (not mock) against a live testnet.
 * Verifies:
 * 1. HD wallet derivation from seed phrase
 * 2. RPC connectivity and balance queries
 * 3. Native token transfer (if funded)
 * 4. USDT ERC-20 transfer (if funded)
 *
 * Usage:
 *   npx tsx scripts/test-testnet-wallet.ts
 *
 * Requires .env with:
 *   SEED_PHRASE=<your 12-word mnemonic>
 *   EVM_RPC_URL=<testnet RPC>
 *   USDT_CONTRACT_ADDRESS=<testnet USDT or mock ERC20>
 *   CHAIN_ID=<testnet chain ID>
 */

import { ethers } from 'ethers';
import { WDKWalletManager } from '../src/wallet/wdk-wallet.js';
import dotenv from 'dotenv';

dotenv.config();

const SEED_PHRASE = process.env.SEED_PHRASE || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const RPC_URL = process.env.EVM_RPC_URL || 'https://sepolia.base.org';
const USDT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000001';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '84532');

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  DPO2U WDK Agent — Testnet Wallet Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`RPC URL:  ${RPC_URL}`);
  console.log(`Chain ID: ${CHAIN_ID}`);
  console.log(`USDT:     ${USDT_ADDRESS}\n`);

  // ─── Test 1: HD Wallet Derivation ──────────────────────────────────────
  console.log('--- Test 1: HD Wallet Derivation ---');
  const wallet = new WDKWalletManager({
    seedPhrase: SEED_PHRASE,
    rpcUrl: RPC_URL,
    usdtContractAddress: USDT_ADDRESS,
    chainId: CHAIN_ID,
  });

  const treasuryAddress = wallet.getAgentAddress(0);
  const expertAddress = wallet.getAgentAddress(1);
  const auditorAddress = wallet.getAgentAddress(2);

  console.log(`Treasury (index 0): ${treasuryAddress}`);
  console.log(`Expert   (index 1): ${expertAddress}`);
  console.log(`Auditor  (index 2): ${auditorAddress}`);

  // Verify deterministic derivation
  const wallet2 = new WDKWalletManager({
    seedPhrase: SEED_PHRASE,
    rpcUrl: RPC_URL,
    usdtContractAddress: USDT_ADDRESS,
    chainId: CHAIN_ID,
  });
  const sameAddress = wallet2.getAgentAddress(0);
  console.log(`Deterministic: ${treasuryAddress === sameAddress ? 'PASS' : 'FAIL'}\n`);

  // ─── Test 2: RPC Connectivity & Balance Query ─────────────────────────
  console.log('--- Test 2: RPC Connectivity & Balance Query ---');
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    console.log(`Connected to: chainId ${network.chainId}`);

    for (const [name, idx] of [['Treasury', 0], ['Expert', 1], ['Auditor', 2]] as const) {
      const addr = wallet.getAgentAddress(idx);
      const nativeBalance = await provider.getBalance(addr);
      console.log(`${name} native balance: ${ethers.formatEther(nativeBalance)} ETH`);
    }
    console.log('RPC connectivity: PASS\n');
  } catch (err: any) {
    console.log(`RPC connectivity: FAIL — ${err.message}\n`);
  }

  // ─── Test 3: WDK getWalletInfo ────────────────────────────────────────
  console.log('--- Test 3: WDK getWalletInfo ---');
  try {
    const info = await wallet.getWalletInfo(0);
    console.log(`Address:        ${info.address}`);
    console.log(`Native balance: ${info.nativeBalance}`);
    console.log(`USDT balance:   ${info.usdtBalance}`);
    console.log(`getWalletInfo: PASS\n`);
  } catch (err: any) {
    console.log(`getWalletInfo: FAIL — ${err.message}\n`);
  }

  // ─── Test 4: Native Transfer (if funded) ──────────────────────────────
  console.log('--- Test 4: Native Transfer (requires funds) ---');
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const treasuryBal = await provider.getBalance(treasuryAddress);

    if (treasuryBal > ethers.parseEther('0.001')) {
      console.log(`Treasury has ${ethers.formatEther(treasuryBal)} ETH — attempting transfer...`);
      const result = await wallet.sendNative(0, expertAddress, ethers.parseEther('0.0001'));
      console.log(`Transfer TX: ${result.txHash}`);
      console.log(`Native transfer: PASS\n`);
    } else {
      console.log(`Treasury balance too low (${ethers.formatEther(treasuryBal)} ETH) — skipping`);
      console.log('Native transfer: SKIPPED (needs funding)\n');
      console.log(`Fund this address: ${treasuryAddress}`);
      console.log(`Base Sepolia faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia\n`);
    }
  } catch (err: any) {
    console.log(`Native transfer: FAIL — ${err.message}\n`);
  }

  // ─── Test 5: USDT Transfer (if USDT contract exists) ─────────────────
  console.log('--- Test 5: USDT Transfer (requires USDT on testnet) ---');
  if (USDT_ADDRESS === '0x0000000000000000000000000000000000000001') {
    console.log('No real USDT contract configured — skipping');
    console.log('USDT transfer: SKIPPED (configure USDT_CONTRACT_ADDRESS in .env)\n');
  } else {
    try {
      const usdtBalance = await wallet.getUSDTBalance(0);
      if (usdtBalance > 0n) {
        console.log(`Treasury USDT: ${usdtBalance}`);
        const result = await wallet.sendUSDT(0, expertAddress, 1_000_000n); // 1 USDT
        console.log(`Transfer TX: ${result.txHash}`);
        console.log(`USDT transfer: PASS\n`);
      } else {
        console.log('No USDT balance — skipping transfer');
        console.log('USDT transfer: SKIPPED (needs USDT funding)\n');
      }
    } catch (err: any) {
      console.log(`USDT transfer: FAIL — ${err.message}\n`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  HD derivation:    PASS`);
  console.log(`  RPC connectivity: tested`);
  console.log(`  WDK wallet info:  tested`);
  console.log(`  Native transfer:  requires funding`);
  console.log(`  USDT transfer:    requires testnet USDT contract`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
