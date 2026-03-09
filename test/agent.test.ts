import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { MockWDKWalletManager } from '../src/wallet/wdk-wallet.js';
import { ComplianceAgent } from '../src/agent/compliance-agent.js';
import { ExpertAgent } from '../src/agent/expert-agent.js';
import { AuditorAgent } from '../src/agent/auditor-agent.js';
import { AgentStatus } from '../src/types.js';
import type { AgentConfig } from '../src/types.js';

const SEED = 'test test test test test test test test test test test junk';

function createWallet(): MockWDKWalletManager {
  const wallet = new MockWDKWalletManager(SEED);
  wallet.setMockBalance(1, 100_000_000n); // 100 USDT expert
  wallet.setMockBalance(2, 80_000_000n);  // 80 USDT auditor
  return wallet;
}

const expertConfig: AgentConfig = {
  did: 'did:dpo2u:expert:test',
  didIndex: 1,
  role: 'expert',
  usdtThreshold: 10_000_000n,
  nightStaked: 1000n,
};

const auditorConfig: AgentConfig = {
  did: 'did:dpo2u:auditor:test',
  didIndex: 2,
  role: 'auditor',
  usdtThreshold: 5_000_000n,
  nightStaked: 500n,
};

describe('ComplianceAgent', () => {
  it('should initialize with Active status', () => {
    const wallet = createWallet();
    const agent = new ComplianceAgent(expertConfig, wallet);
    assert.equal(agent.status, AgentStatus.Active);
  });

  it('should check solvency correctly', async () => {
    const wallet = createWallet();
    const agent = new ComplianceAgent(expertConfig, wallet);

    const solvent = await agent.checkSolvency();
    assert.equal(solvent, true);
  });

  it('should detect insolvency', async () => {
    const wallet = createWallet();
    wallet.setMockBalance(1, 5_000_000n); // Below 10 USDT threshold
    const agent = new ComplianceAgent(expertConfig, wallet);

    const solvent = await agent.checkSolvency();
    assert.equal(solvent, false);
  });

  it('should accept job when solvent and active', async () => {
    const wallet = createWallet();
    const agent = new ComplianceAgent(expertConfig, wallet);

    const canAccept = await agent.acceptJob();
    assert.equal(canAccept, true);
  });

  it('should reject job when inactive', async () => {
    const wallet = createWallet();
    const agent = new ComplianceAgent(expertConfig, wallet);
    agent.status = AgentStatus.Deactivated;

    const canAccept = await agent.acceptJob();
    assert.equal(canAccept, false);
  });

  it('should pay another agent via A2A', async () => {
    const wallet = createWallet();
    const agent = new ComplianceAgent(expertConfig, wallet);
    const auditorAddress = wallet.getAgentAddress(2);

    const result = await agent.payAgent(auditorAddress, 20_000_000n);
    assert.equal(result.amount, 20_000_000n);
    assert.equal(result.to, auditorAddress);
    assert.equal(result.token, 'USDT');
  });

  it('should track consecutive payment failures', async () => {
    const wallet = createWallet();
    const agent = new ComplianceAgent(expertConfig, wallet);

    assert.equal(agent.consecutiveFailures, 0);

    agent.recordPaymentFailure();
    assert.equal(agent.consecutiveFailures, 1);

    agent.recordPaymentFailure();
    assert.equal(agent.consecutiveFailures, 2);

    // Success resets the counter
    agent.recordPaymentSuccess();
    assert.equal(agent.consecutiveFailures, 0);
  });

  it('should reset failure counter on successful payment', async () => {
    const wallet = createWallet();
    const agent = new ComplianceAgent(expertConfig, wallet);
    const auditorAddress = wallet.getAgentAddress(2);

    agent.recordPaymentFailure();
    agent.recordPaymentFailure();
    assert.equal(agent.consecutiveFailures, 2);

    // Successful A2A payment resets counter
    await agent.payAgent(auditorAddress, 10_000_000n);
    assert.equal(agent.consecutiveFailures, 0);
  });

  it('should log events', async () => {
    const wallet = createWallet();
    const agent = new ComplianceAgent(expertConfig, wallet);
    await agent.checkSolvency();

    const events = agent.getEventLog();
    assert.ok(events.length > 0);
    assert.equal(events[0].type, 'solvency_check');
  });
});

describe('ExpertAgent', () => {
  it('should require expert role', () => {
    const wallet = createWallet();
    assert.throws(
      () => new ExpertAgent({ ...expertConfig, role: 'auditor' }, wallet),
      /ExpertAgent requires role "expert"/,
    );
  });

  it('should execute job end-to-end', async () => {
    const wallet = createWallet();
    const expert = new ExpertAgent(expertConfig, wallet);
    const auditor = new AuditorAgent(auditorConfig, wallet);

    const result = await expert.executeJob(
      {
        clientAddress: '0xClient',
        companyId: 'test_company',
        amount: 100_000_000n,
        framework: 'lgpd',
      },
      auditor,
    );

    assert.equal(result.companyId, 'test_company');
    assert.ok(result.score >= 60 && result.score <= 100);
    assert.ok(result.policyCid.length > 0);
    assert.ok(result.attestationTx!.startsWith('0xmidnight_'));
    assert.equal(result.expertDid, expertConfig.did);
    assert.equal(result.auditorDid, auditorConfig.did);
    assert.equal(result.framework, 'lgpd');
  });

  it('should reject job when insolvent', async () => {
    const wallet = createWallet();
    wallet.setMockBalance(1, 1_000_000n); // 1 USDT, below threshold
    const expert = new ExpertAgent(expertConfig, wallet);
    const auditor = new AuditorAgent(auditorConfig, wallet);

    await assert.rejects(
      () => expert.executeJob(
        { clientAddress: '0xClient', companyId: 'test', amount: 100_000_000n, framework: 'lgpd' },
        auditor,
      ),
      /cannot accept job/,
    );
  });
});

describe('AuditorAgent', () => {
  it('should require auditor role', () => {
    const wallet = createWallet();
    assert.throws(
      () => new AuditorAgent({ ...auditorConfig, role: 'expert' }, wallet),
      /AuditorAgent requires role "auditor"/,
    );
  });

  it('should execute audit', async () => {
    const wallet = createWallet();
    const auditor = new AuditorAgent(auditorConfig, wallet);

    const result = await auditor.executeAudit('test_company', 'bafyevidence');
    assert.equal(result.companyId, 'test_company');
    assert.ok(result.score >= 60 && result.score <= 100);
    assert.ok(result.policyCid.length > 0);
    assert.equal(result.computeCost, 5_000_000n);
  });

  it('should produce deterministic scores', async () => {
    const wallet = createWallet();
    const auditor1 = new AuditorAgent(auditorConfig, wallet);
    const auditor2 = new AuditorAgent(auditorConfig, wallet);

    const result1 = await auditor1.executeAudit('same_company', 'evidence');
    const result2 = await auditor2.executeAudit('same_company', 'evidence');

    assert.equal(result1.score, result2.score);
  });
});
