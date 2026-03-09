#!/usr/bin/env tsx
/**
 * Agent Setup Script
 * Initializes agent wallets and registers them in the protocol.
 */

import { ethers } from 'ethers';
import { MockWDKWalletManager } from '../src/wallet/wdk-wallet.js';
import { ExpertAgent } from '../src/agent/expert-agent.js';
import { AuditorAgent } from '../src/agent/auditor-agent.js';
import { AgentRegistry } from '../src/protocol/agent-registry.js';
import type { AgentConfig } from '../src/types.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('=== DPO2U Agent Setup ===\n');

  const seedPhrase = process.env.SEED_PHRASE || ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(16));
  console.log(`Seed: ${seedPhrase}\n`);

  const wallet = new MockWDKWalletManager(seedPhrase);

  // Fund agents for demo
  wallet.setMockBalance(0, 500_000_000n);  // 500 USDT treasury
  wallet.setMockBalance(1, 100_000_000n);  // 100 USDT expert
  wallet.setMockBalance(2, 80_000_000n);   // 80 USDT auditor

  // Define agent configs
  const expertConfig: AgentConfig = {
    did: 'did:dpo2u:expert:001',
    didIndex: 1,
    role: 'expert',
    usdtThreshold: 10_000_000n,  // 10 USDT minimum
    nightStaked: 1000n,
  };

  const auditorConfig: AgentConfig = {
    did: 'did:dpo2u:auditor:001',
    didIndex: 2,
    role: 'auditor',
    usdtThreshold: 5_000_000n,   // 5 USDT minimum
    nightStaked: 500n,
  };

  // Create agents
  const expert = new ExpertAgent(expertConfig, wallet);
  const auditor = new AuditorAgent(auditorConfig, wallet);

  // Register in protocol
  const registry = new AgentRegistry();
  registry.registerAgent(expert);
  registry.registerAgent(auditor);

  console.log('\n--- Registered Agents ---');
  for (const agent of registry.getAllAgents()) {
    const balance = await agent.getBalance();
    const solvent = await agent.checkSolvency();
    console.log(`  ${agent.config.did} (${agent.config.role})`);
    console.log(`    Address: ${agent.address}`);
    console.log(`    Balance: ${Number(balance.usdtBalance) / 1e6} USDT`);
    console.log(`    Threshold: ${Number(agent.config.usdtThreshold) / 1e6} USDT`);
    console.log(`    Solvent: ${solvent}`);
    console.log(`    Status: ${agent.status}`);
  }

  console.log('\n✓ Agents setup complete');
}

main().catch(console.error);
