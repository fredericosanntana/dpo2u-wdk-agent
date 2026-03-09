import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { MockWDKWalletManager } from '../src/wallet/wdk-wallet.js';
import { ComplianceAgent } from '../src/agent/compliance-agent.js';
import { PaymentGateway } from '../src/protocol/payment-gateway.js';
import { FeeDistributor } from '../src/protocol/fee-distributor.js';
import { AgentRegistry } from '../src/protocol/agent-registry.js';
import { SolvencyMonitor } from '../src/monitor/solvency-monitor.js';
import { AgentStatus, calculateFeeDistribution } from '../src/types.js';
import type { AgentConfig } from '../src/types.js';

const SEED = 'test test test test test test test test test test test junk';

function createWallet(): MockWDKWalletManager {
  const wallet = new MockWDKWalletManager(SEED);
  wallet.setMockBalance(0, 500_000_000n); // 500 USDT treasury
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

describe('calculateFeeDistribution', () => {
  it('should split 100 USDT correctly', () => {
    const dist = calculateFeeDistribution(100_000_000n);
    assert.equal(dist.protocolFee, 10_000_000n);  // 10%
    assert.equal(dist.expertShare, 36_000_000n);   // 36% of total
    assert.equal(dist.auditorShare, 54_000_000n);  // 54% of total
    assert.equal(dist.protocolFee + dist.expertShare + dist.auditorShare, 100_000_000n);
  });

  it('should handle small amounts', () => {
    const dist = calculateFeeDistribution(10_000_000n);
    assert.equal(dist.protocolFee, 1_000_000n);
    assert.equal(dist.protocolFee + dist.expertShare + dist.auditorShare, 10_000_000n);
  });

  it('should handle 1 USDT', () => {
    const dist = calculateFeeDistribution(1_000_000n);
    assert.equal(dist.protocolFee + dist.expertShare + dist.auditorShare, 1_000_000n);
  });
});

describe('PaymentGateway', () => {
  it('should receive payment and calculate distribution', async () => {
    const wallet = createWallet();
    const gateway = new PaymentGateway(wallet, 0);

    const { distribution } = await gateway.receivePayment('0xClient', 100_000_000n);
    assert.equal(distribution.protocolFee, 10_000_000n);
    assert.equal(distribution.expertShare + distribution.auditorShare, 90_000_000n);
  });

  it('should reject zero payment', async () => {
    const wallet = createWallet();
    const gateway = new PaymentGateway(wallet, 0);

    await assert.rejects(
      () => gateway.receivePayment('0xClient', 0n),
      /Payment amount must be greater than zero/,
    );
  });

  it('should track stats', async () => {
    const wallet = createWallet();
    const gateway = new PaymentGateway(wallet, 0);

    await gateway.receivePayment('0xClient1', 50_000_000n);
    await gateway.receivePayment('0xClient2', 100_000_000n);

    const stats = gateway.getStats();
    assert.equal(stats.totalReceived, 150_000_000n);
    assert.equal(stats.totalProtocolFees, 15_000_000n);
  });

  it('should extract protocol fee', () => {
    const wallet = createWallet();
    const gateway = new PaymentGateway(wallet, 0);

    assert.equal(gateway.extractProtocolFee(100_000_000n), 10_000_000n);
    assert.equal(gateway.extractProtocolFee(200_000_000n), 20_000_000n);
  });

  it('should log events', async () => {
    const wallet = createWallet();
    const gateway = new PaymentGateway(wallet, 0);

    await gateway.receivePayment('0xClient', 100_000_000n);

    const events = gateway.getEventLog();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'payment_received');
  });
});

describe('FeeDistributor', () => {
  it('should distribute fees to expert and auditor', async () => {
    const wallet = createWallet();
    const distributor = new FeeDistributor(wallet, 0);
    const distribution = calculateFeeDistribution(100_000_000n);

    const expertAddress = wallet.getAgentAddress(1);
    const auditorAddress = wallet.getAgentAddress(2);

    const result = await distributor.distributeFees(distribution, expertAddress, auditorAddress);

    assert.equal(result.expertTransfer.amount, 36_000_000n);
    assert.equal(result.auditorTransfer.amount, 54_000_000n);
    assert.equal(result.treasuryTransfer.amount, 10_000_000n);
  });

  it('should track total distributed', async () => {
    const wallet = createWallet();
    const distributor = new FeeDistributor(wallet, 0);
    const distribution = calculateFeeDistribution(100_000_000n);

    const expertAddress = wallet.getAgentAddress(1);
    const auditorAddress = wallet.getAgentAddress(2);

    await distributor.distributeFees(distribution, expertAddress, auditorAddress);

    const stats = distributor.getStats();
    assert.equal(stats.totalDistributed, 90_000_000n);
  });
});

describe('AgentRegistry', () => {
  it('should register agents', () => {
    const wallet = createWallet();
    const registry = new AgentRegistry();
    const expert = new ComplianceAgent(expertConfig, wallet);

    registry.registerAgent(expert);
    assert.equal(registry.getAllAgents().length, 1);
    assert.equal(registry.getActiveAgents().length, 1);
  });

  it('should reject duplicate registration', () => {
    const wallet = createWallet();
    const registry = new AgentRegistry();
    const expert = new ComplianceAgent(expertConfig, wallet);

    registry.registerAgent(expert);
    assert.throws(
      () => registry.registerAgent(expert),
      /already registered/,
    );
  });

  it('should detect insolvency and set probation', async () => {
    const wallet = createWallet();
    wallet.setMockBalance(1, 5_000_000n); // Below threshold
    const registry = new AgentRegistry();
    const expert = new ComplianceAgent(expertConfig, wallet);

    registry.registerAgent(expert);
    await registry.checkPostJobSolvency(expert);

    assert.equal(expert.status, AgentStatus.Probation);
    assert.equal(registry.getActiveAgents().length, 0);
  });

  it('should recover from probation when solvency restored', async () => {
    const wallet = createWallet();
    wallet.setMockBalance(1, 5_000_000n);
    const registry = new AgentRegistry();
    const expert = new ComplianceAgent(expertConfig, wallet);

    registry.registerAgent(expert);
    await registry.checkPostJobSolvency(expert);
    assert.equal(expert.status, AgentStatus.Probation);

    // Restore solvency
    wallet.setMockBalance(1, 50_000_000n);
    await registry.checkPostJobSolvency(expert);
    assert.equal(expert.status, AgentStatus.Active);
  });

  it('should deactivate agents', () => {
    const wallet = createWallet();
    const registry = new AgentRegistry();
    const expert = new ComplianceAgent(expertConfig, wallet);

    registry.registerAgent(expert);
    registry.deactivateAgent(expert);

    assert.equal(expert.status, AgentStatus.Deactivated);
    assert.equal(registry.getActiveAgents().length, 0);
  });

  it('should get agent by DID', () => {
    const wallet = createWallet();
    const registry = new AgentRegistry();
    const expert = new ComplianceAgent(expertConfig, wallet);

    registry.registerAgent(expert);
    const found = registry.getAgent(expertConfig.did);
    assert.ok(found);
    assert.equal(found!.config.did, expertConfig.did);
  });
});

describe('SolvencyMonitor', () => {
  it('should run single check', async () => {
    const wallet = createWallet();
    const registry = new AgentRegistry();
    const expert = new ComplianceAgent(expertConfig, wallet);
    const auditor = new ComplianceAgent(auditorConfig, wallet);

    registry.registerAgent(expert);
    registry.registerAgent(auditor);

    const monitor = new SolvencyMonitor(registry, 60_000);
    const result = await monitor.runCheck();

    assert.equal(result.checked, 2);
    assert.equal(result.active, 2);
    assert.equal(result.probation, 0);
    assert.equal(result.deactivated, 0);
  });

  it('should detect insolvency during check', async () => {
    const wallet = createWallet();
    wallet.setMockBalance(1, 1_000_000n); // Below threshold
    const registry = new AgentRegistry();
    const expert = new ComplianceAgent(expertConfig, wallet);

    registry.registerAgent(expert);

    const monitor = new SolvencyMonitor(registry, 60_000);
    const result = await monitor.runCheck();

    assert.equal(result.probation, 1);
    assert.equal(result.active, 0);
  });

  it('should start and stop', () => {
    const wallet = createWallet();
    const registry = new AgentRegistry();
    const monitor = new SolvencyMonitor(registry, 60_000);

    monitor.start();
    assert.equal(monitor.isRunning(), true);

    monitor.stop();
    assert.equal(monitor.isRunning(), false);
  });
});
