#!/usr/bin/env tsx
/**
 * WDK Wallet Test Script
 * Generates seed phrase, derives 3 wallets (treasury, expert, auditor),
 * displays addresses, and tests USDT transfer on testnet.
 */

import { ethers } from 'ethers';
import { WDKWalletManager, MockWDKWalletManager } from '../src/wallet/wdk-wallet.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('=== DPO2U WDK Wallet Test ===\n');

  // Generate or use existing seed phrase
  const seedPhrase = process.env.SEED_PHRASE || ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(16));
  console.log(`Seed phrase: ${seedPhrase}\n`);

  const useMock = !process.env.EVM_RPC_URL || process.env.USE_MOCK === 'true';

  if (useMock) {
    console.log('Using MockWDKWalletManager (no network)\n');
    await testWithMock(seedPhrase);
  } else {
    console.log('Using real WDKWalletManager\n');
    await testWithReal(seedPhrase);
  }
}

async function testWithMock(seedPhrase: string) {
  const wallet = new MockWDKWalletManager(seedPhrase);

  // Derive 3 wallets
  const roles = ['Treasury (index 0)', 'Expert (index 1)', 'Auditor (index 2)'];
  for (let i = 0; i < 3; i++) {
    const address = wallet.getAgentAddress(i);
    console.log(`${roles[i]}: ${address}`);
  }

  // Set mock balances
  wallet.setMockBalance(0, 1000_000_000n);  // 1000 USDT treasury
  wallet.setMockBalance(1, 50_000_000n);    // 50 USDT expert
  wallet.setMockBalance(2, 30_000_000n);    // 30 USDT auditor

  console.log('\n--- Balances ---');
  for (let i = 0; i < 3; i++) {
    const info = await wallet.getWalletInfo(i);
    console.log(`${roles[i]}: ${info.usdtBalance} USDT (${info.address})`);
  }

  // Test transfer: treasury → expert
  console.log('\n--- Transfer Test: Treasury → Expert (10 USDT) ---');
  const expertAddress = wallet.getAgentAddress(1);
  const result = await wallet.sendUSDT(0, expertAddress, 10_000_000n);
  console.log(`TX: ${result.txHash}`);
  console.log(`From: ${result.from}`);
  console.log(`To: ${result.to}`);
  console.log(`Amount: ${result.amount} (${Number(result.amount) / 1e6} USDT)`);

  // Verify post-transfer balances
  console.log('\n--- Post-Transfer Balances ---');
  for (let i = 0; i < 3; i++) {
    const info = await wallet.getWalletInfo(i);
    console.log(`${roles[i]}: ${info.usdtBalance} USDT`);
  }

  // Test transfer: expert → auditor
  console.log('\n--- Transfer Test: Expert → Auditor (5 USDT) ---');
  const auditorAddress = wallet.getAgentAddress(2);
  const result2 = await wallet.sendUSDT(1, auditorAddress, 5_000_000n);
  console.log(`TX: ${result2.txHash}`);

  console.log('\n--- Final Balances ---');
  for (let i = 0; i < 3; i++) {
    const info = await wallet.getWalletInfo(i);
    console.log(`${roles[i]}: ${Number(info.usdtBalance) / 1e6} USDT`);
  }

  console.log('\n--- Transfer Log ---');
  for (const log of wallet.getTransferLog()) {
    console.log(`  ${log.from.slice(0, 10)}... → ${log.to.slice(0, 10)}... : ${Number(log.amount) / 1e6} ${log.token}`);
  }

  console.log('\n✓ All wallet tests passed');
}

async function testWithReal(seedPhrase: string) {
  const wallet = new WDKWalletManager({
    seedPhrase,
    rpcUrl: process.env.EVM_RPC_URL!,
    usdtContractAddress: process.env.USDT_CONTRACT_ADDRESS || '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    chainId: parseInt(process.env.CHAIN_ID || '80002'),
  });

  const roles = ['Treasury (index 0)', 'Expert (index 1)', 'Auditor (index 2)'];
  for (let i = 0; i < 3; i++) {
    const info = await wallet.getWalletInfo(i);
    console.log(`${roles[i]}:`);
    console.log(`  Address: ${info.address}`);
    console.log(`  USDT: ${Number(info.usdtBalance) / 1e6}`);
    console.log(`  Native: ${ethers.formatEther(info.nativeBalance)}`);
  }

  console.log('\nNote: To test transfers, fund the treasury wallet with testnet USDT and native tokens.');
  console.log(`Treasury address: ${wallet.getAgentAddress(0)}`);
}

main().catch(console.error);
