#!/usr/bin/env tsx
/**
 * DPO2U — End-to-End Demo: Midnight → Hedera Testnet
 *
 * Demonstrates the full cross-chain compliance flow:
 *   1. AuditorAgent evaluates a test company (LGPD)
 *   2. Attestation registered on Midnight (simulated)
 *   3. Relayer propagates to Hedera Testnet (direct call)
 *   4. Query isCompliant() on Hedera — returns true
 *   5. OpenClaw skill checks compliance via HCS-10 agent
 *
 * Usage: npm run demo:hedera
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import { MockWDKWalletManager } from '../src/wallet/wdk-wallet.js';
import { ComplianceSkill } from '../src/openclaw/compliance-skill.js';
import { HederaComplianceRegistry } from '../src/hedera/hedera-registry.js';
import type { AgentConfig } from '../src/types.js';

const USDT = (n: number) => BigInt(n * 1_000_000);
const SEED = 'test test test test test test test test test test test junk';

const expertConfig: AgentConfig = {
  did: 'did:dpo2u:expert:demo',
  didIndex: 1,
  role: 'expert',
  usdtThreshold: USDT(10),
  nightStaked: 1000n,
};

const auditorConfig: AgentConfig = {
  did: 'did:dpo2u:auditor:demo',
  didIndex: 2,
  role: 'auditor',
  usdtThreshold: USDT(5),
  nightStaked: 500n,
};

function header(title: string) {
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'━'.repeat(60)}\n`);
}

function step(n: number, title: string) {
  console.log(`\n  ┌─ Step ${n}: ${title}`);
  console.log(`  │`);
}

function log(msg: string) {
  console.log(`  │  ${msg}`);
}

function done(msg: string) {
  console.log(`  │  ${msg}`);
  console.log(`  └─ OK\n`);
}

async function main() {
  header('DPO2U — E2E Demo: Midnight → Hedera Testnet');

  const hederaRpc = process.env.HEDERA_RPC || 'https://testnet.hashio.io/api';
  const hederaRegistryAddress = process.env.HEDERA_REGISTRY_ADDRESS;
  const relayerKey = process.env.RELAYER_PRIVATE_KEY;
  const hederaAgentDid = process.env.HEDERA_AGENT_TOPIC_ID
    ? `did:hedera:testnet:${process.env.HEDERA_AGENT_TOPIC_ID}`
    : 'did:hedera:testnet:0.0.demo';

  // ─── Step 1: AuditorAgent evaluates a test company ────────────────
  step(1, 'AuditorAgent evaluates test company (LGPD)');

  const wallet = new MockWDKWalletManager(SEED);
  wallet.setMockBalance(1, USDT(100));
  wallet.setMockBalance(2, USDT(80));

  const skill = new ComplianceSkill({
    wallet,
    expertConfig,
    auditorConfig,
    hederaRegistryAddress: hederaRegistryAddress || undefined,
    hederaRpc,
    hederaAgentDid,
  });

  const result = await skill.verifyCompliance(
    'acme_corp_br',
    'lgpd',
    '0xC1ient000000000000000000000000000000dead',
    USDT(100),
  );

  log(`Company:    acme_corp_br`);
  log(`Framework:  ${result.framework}`);
  log(`Score:      ${result.score}/100`);
  log(`Policy CID: ${result.policyCid}`);
  log(`Expert:     ${result.expertDid}`);
  log(`Auditor:    ${result.auditorDid}`);
  done('Audit complete');

  // ─── Step 2: Register attestation on Midnight (simulated) ─────────
  step(2, 'Register attestation on Midnight (simulated)');

  const attestationId = ethers.keccak256(
    ethers.toUtf8Bytes(`acme_corp_br_lgpd_${Date.now()}`)
  );
  const orgHash = ethers.keccak256(ethers.toUtf8Bytes('acme_corp_br'));

  log(`Attestation ID: ${attestationId.slice(0, 18)}...`);
  log(`Org Hash:       ${orgHash.slice(0, 18)}...`);
  log(`Midnight TX:    ${result.attestationTx}`);
  done('Attestation registered on Midnight (simulated)');

  // ─── Step 3: Relayer propagates to Hedera ─────────────────────────
  step(3, 'Relayer propagates to Hedera Testnet');

  if (hederaRegistryAddress && relayerKey && hederaRegistryAddress !== '0x0000000000000000000000000000000000000000') {
    // Live relay to Hedera
    const registry = new HederaComplianceRegistry(hederaRegistryAddress, hederaRpc);
    const signedContract = registry.getSignedContract(relayerKey);

    const agentDidBytes = ethers.zeroPadBytes(ethers.toUtf8Bytes(result.auditorDid.slice(0, 32)), 32);
    const commitment = ethers.keccak256(ethers.toUtf8Bytes(result.policyCid));
    const validUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year

    try {
      const tx = await signedContract.registerAttestationFromMidnight(
        attestationId,
        orgHash,
        'LGPD',
        BigInt(result.score),
        BigInt(validUntil),
        agentDidBytes,
        result.policyCid,
        commitment,
        { gasLimit: 500_000 },
      );

      log(`TX hash: ${tx.hash}`);
      log('Waiting for confirmation...');

      const receipt = await tx.wait();
      log(`Confirmed in block ${receipt.blockNumber}`);
      done('Attestation relayed to Hedera Testnet');
    } catch (err: any) {
      log(`Relay failed: ${err.message}`);
      log('(This is expected if contract is not yet deployed or wallet not funded)');
      done('Relay simulated — deploy contract first with: npm run deploy:hedera');
    }
  } else {
    log('No HEDERA_REGISTRY_ADDRESS or RELAYER_PRIVATE_KEY configured');
    log('Simulating relay...');
    log(`Would register attestation ${attestationId.slice(0, 18)}... on Hedera`);
    done('Relay simulated — set env vars for live relay');
  }

  // ─── Step 4: Query isCompliant() on Hedera ────────────────────────
  step(4, 'Query isCompliant() on Hedera');

  if (hederaRegistryAddress && hederaRegistryAddress !== '0x0000000000000000000000000000000000000000') {
    try {
      const registry = new HederaComplianceRegistry(hederaRegistryAddress, hederaRpc);
      const exists = await registry.attestationExists(attestationId);
      log(`attestationExists: ${exists}`);

      if (exists) {
        const isCompliant = await registry.isCompliant(attestationId);
        const score = await registry.getScore(attestationId);
        log(`isCompliant: ${isCompliant}`);
        log(`Score: ${score}/100`);
      }
      done('Hedera query complete');
    } catch (err: any) {
      log(`Query failed: ${err.message}`);
      done('Query simulated — contract not accessible');
    }
  } else {
    log('Simulating Hedera query...');
    log(`isCompliant(acme_corp_br): true (score=${result.score})`);
    done('Query simulated');
  }

  // ─── Step 5: OpenClaw skill manifest with Hedera ──────────────────
  step(5, 'OpenClaw skill checks compliance via HCS-10 agent');

  const manifest = ComplianceSkill.getManifest(hederaAgentDid);
  log(`Skill name:    ${manifest.name}`);
  log(`Version:       ${manifest.version}`);
  log(`Chains:        ${manifest.chains.join(', ')}`);
  log(`Capabilities:  ${manifest.capabilities.map(c => c.name).join(', ')}`);
  log(`Hedera DID:    ${(manifest as any).hederaDid || 'not set'}`);
  log(`Wallet type:   ${manifest.walletType}`);

  // Solvency check
  const solvency = await skill.checkAgentSolvency();
  for (const agent of solvency) {
    log(`Agent ${agent.role}: ${agent.status}, solvent=${agent.solvent}, balance=${agent.balance}`);
  }

  done('OpenClaw manifest verified with Hedera support');

  // ─── Summary ──────────────────────────────────────────────────────
  header('Demo Complete');
  console.log('  Flow: AuditorAgent → Midnight → Relayer → Hedera Testnet → OpenClaw');
  console.log(`  Company:     acme_corp_br`);
  console.log(`  Score:       ${result.score}/100`);
  console.log(`  Chains:      ${manifest.chains.join(', ')}`);
  console.log(`  Agent DID:   ${hederaAgentDid}`);
  console.log(`  Capabilities: ${manifest.capabilities.length} (incl. checkHederaCompliance)`);
  console.log('');
}

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exitCode = 1;
});
