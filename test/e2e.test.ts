import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { MockWDKWalletManager } from '../src/wallet/wdk-wallet.js';
import { ExpertAgent } from '../src/agent/expert-agent.js';
import { AuditorAgent } from '../src/agent/auditor-agent.js';
import { PaymentGateway } from '../src/protocol/payment-gateway.js';
import { FeeDistributor } from '../src/protocol/fee-distributor.js';
import { AgentRegistry } from '../src/protocol/agent-registry.js';
import { SolvencyMonitor } from '../src/monitor/solvency-monitor.js';
import { ComplianceSkill } from '../src/openclaw/compliance-skill.js';
import { AgentStatus } from '../src/types.js';
import type { AgentConfig, JobRequest } from '../src/types.js';

const SEED = 'test test test test test test test test test test test junk';
const USDT = (n: number) => BigInt(n * 1_000_000);

const expertConfig: AgentConfig = {
  did: 'did:dpo2u:expert:e2e',
  didIndex: 1,
  role: 'expert',
  usdtThreshold: USDT(10),
  nightStaked: 1000n,
};

const auditorConfig: AgentConfig = {
  did: 'did:dpo2u:auditor:e2e',
  didIndex: 2,
  role: 'auditor',
  usdtThreshold: USDT(5),
  nightStaked: 500n,
};

describe('E2E: Full Compliance Pipeline', () => {
  it('should execute complete job flow with 9 criteria', async () => {
    // Setup
    const wallet = new MockWDKWalletManager(SEED);
    wallet.setMockBalance(0, USDT(500));
    wallet.setMockBalance(1, USDT(100));
    wallet.setMockBalance(2, USDT(80));

    const expert = new ExpertAgent(expertConfig, wallet);
    const auditor = new AuditorAgent(auditorConfig, wallet);
    const gateway = new PaymentGateway(wallet, 0);
    const distributor = new FeeDistributor(wallet, 0);
    const registry = new AgentRegistry();
    const monitor = new SolvencyMonitor(registry, 60_000);

    registry.registerAgent(expert);
    registry.registerAgent(auditor);

    // Criterion 1: WDK wallets derived from DID
    assert.match(expert.address, /^0x[0-9a-fA-F]{40}$/);
    assert.match(auditor.address, /^0x[0-9a-fA-F]{40}$/);
    assert.notEqual(expert.address, auditor.address);

    // Criterion 2: Client pays 100 USDT
    const clientAddress = '0xC1ient000000000000000000000000000000dead';
    const { distribution } = await gateway.receivePayment(clientAddress, USDT(100));
    assert.equal(distribution.protocolFee, USDT(10));
    assert.equal(distribution.expertShare + distribution.auditorShare, USDT(90));

    // Credit treasury
    const treasuryBal = await wallet.getUSDTBalance(0);
    wallet.setMockBalance(0, treasuryBal + USDT(100));

    // Criterion 3: Expert verifies solvency
    const expertSolvent = await expert.checkSolvency();
    assert.equal(expertSolvent, true);

    // Criterion 4+5+6: Expert executes job (A2A payment, x402, attestation)
    const job: JobRequest = {
      clientAddress,
      companyId: 'acme_corp_br',
      amount: USDT(100),
      framework: 'lgpd',
    };
    const result = await expert.executeJob(job, auditor);

    assert.equal(result.companyId, 'acme_corp_br');
    assert.ok(result.score >= 60 && result.score <= 100);
    assert.ok(result.policyCid.length > 0);
    assert.ok(result.attestationTx);
    assert.equal(result.framework, 'lgpd');

    // Criterion 4 verification: A2A payment happened
    const expertEvents = expert.getEventLog().filter(e => e.type === 'agent_paid');
    assert.ok(expertEvents.length > 0);

    // Criterion 5 verification: x402 compute payment happened
    const auditorEvents = auditor.getEventLog().filter(e => e.type === 'compute_paid');
    assert.ok(auditorEvents.length > 0);

    // Criterion 6 verification: Attestation registered
    const attestationEvents = expert.getEventLog().filter(e => e.type === 'attestation_registered');
    assert.ok(attestationEvents.length > 0);

    // Criterion 7: Fee distribution
    const expertAddr = wallet.getAgentAddress(1);
    const auditorAddr = wallet.getAgentAddress(2);
    const distResult = await distributor.distributeFees(distribution, expertAddr, auditorAddr);
    assert.equal(distResult.expertTransfer.amount, USDT(36));
    assert.equal(distResult.auditorTransfer.amount, USDT(54));

    // Criterion 8: Post-distribution solvency
    const monitorResult = await monitor.runCheck();
    assert.equal(monitorResult.checked, 2);

    // Criterion 9: Zero human interactions (verified by test execution itself)
  });

  it('should handle solvency failure and probation', async () => {
    const wallet = new MockWDKWalletManager(SEED);
    wallet.setMockBalance(1, USDT(100));
    wallet.setMockBalance(2, USDT(80));

    const expert = new ExpertAgent(expertConfig, wallet);
    const auditor = new AuditorAgent(auditorConfig, wallet);
    const registry = new AgentRegistry();
    const monitor = new SolvencyMonitor(registry, 60_000);

    registry.registerAgent(expert);
    registry.registerAgent(auditor);

    // Verify initially active
    assert.equal(expert.status, AgentStatus.Active);

    // Drain expert balance
    wallet.setMockBalance(1, USDT(2));
    await monitor.runCheck();

    // Expert should be in probation
    assert.equal(expert.status, AgentStatus.Probation);
    assert.equal(registry.getActiveAgents().length, 1); // Only auditor

    // Expert should reject jobs
    const canAccept = await expert.acceptJob();
    assert.equal(canAccept, false);

    // Restore solvency
    wallet.setMockBalance(1, USDT(50));
    await monitor.runCheck();
    assert.equal(expert.status, AgentStatus.Active);
  });

  it('should execute via ComplianceSkill', async () => {
    const wallet = new MockWDKWalletManager(SEED);
    wallet.setMockBalance(1, USDT(100));
    wallet.setMockBalance(2, USDT(80));

    const skill = new ComplianceSkill({
      wallet,
      expertConfig,
      auditorConfig,
    });

    // Verify compliance
    const result = await skill.verifyCompliance(
      'test_company',
      'gdpr',
      '0xClient',
      USDT(50),
    );
    assert.equal(result.companyId, 'test_company');
    assert.equal(result.framework, 'gdpr');
    assert.ok(result.score >= 60);

    // Check solvency
    const solvencyReport = await skill.checkAgentSolvency();
    assert.equal(solvencyReport.length, 2);

    // Attest compliance
    const txHash = await skill.attestCompliance('test_company', 85, 'bafyCID');
    assert.ok(txHash.startsWith('0xattest_'));
  });

  it('should return correct OpenClaw manifest', () => {
    const manifest = ComplianceSkill.getManifest();
    assert.equal(manifest.name, 'dpo2u-compliance');
    assert.equal(manifest.capabilities.length, 3);
    assert.deepEqual(manifest.chains, ['midnight', 'polkadot', 'starknet']);
    assert.equal(manifest.walletType, 'wdk-evm');
  });
});
