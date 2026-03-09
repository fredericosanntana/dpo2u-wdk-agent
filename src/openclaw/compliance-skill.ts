/**
 * OpenClaw Compliance Skill
 * Packaged skill for the OpenClaw platform exposing DPO2U compliance capabilities.
 */

import { ExpertAgent } from '../agent/expert-agent.js';
import { AuditorAgent } from '../agent/auditor-agent.js';
import type { WDKWalletManager } from '../wallet/wdk-wallet.js';
import { AgentRegistry } from '../protocol/agent-registry.js';
import type { AgentConfig, JobResult } from '../types.js';

export interface ComplianceSkillConfig {
  wallet: WDKWalletManager;
  expertConfig: AgentConfig;
  auditorConfig: AgentConfig;
  x402Endpoint?: string;
}

export class ComplianceSkill {
  private expert: ExpertAgent;
  private auditor: AuditorAgent;
  private registry: AgentRegistry;

  constructor(config: ComplianceSkillConfig) {
    this.expert = new ExpertAgent(config.expertConfig, config.wallet);
    this.auditor = new AuditorAgent(config.auditorConfig, config.wallet, config.x402Endpoint);
    this.registry = new AgentRegistry();
    this.registry.registerAgent(this.expert);
    this.registry.registerAgent(this.auditor);
  }

  /**
   * Verify compliance for a company.
   * Runs full audit pipeline: expert accepts → auditor audits → attestation registered.
   */
  async verifyCompliance(
    companyId: string,
    framework: 'lgpd' | 'gdpr' | 'lgpd_gdpr',
    clientAddress: string,
    amount: bigint,
  ): Promise<JobResult> {
    return this.expert.executeJob(
      { clientAddress, companyId, amount, framework },
      this.auditor,
    );
  }

  /**
   * Attest compliance result (already completed audit).
   */
  async attestCompliance(
    companyId: string,
    score: number,
    policyCid: string,
  ): Promise<string> {
    // Mock Midnight attestation
    const txHash = `0xattest_${companyId}_${score}_${Date.now().toString(16)}`;
    console.log(`[ComplianceSkill] Attestation: company=${companyId}, score=${score}, cid=${policyCid}`);
    return txHash;
  }

  /**
   * Check solvency status of all registered agents.
   */
  async checkAgentSolvency(): Promise<Array<{
    did: string;
    role: string;
    status: string;
    solvent: boolean;
    balance: bigint;
  }>> {
    const results = [];
    for (const agent of this.registry.getAllAgents()) {
      const balance = await agent.getBalance();
      const solvent = await agent.checkSolvency();
      results.push({
        did: agent.config.did,
        role: agent.config.role,
        status: agent.status,
        solvent,
        balance: balance.usdtBalance,
      });
    }
    return results;
  }

  /**
   * Get the OpenClaw skill manifest.
   */
  static getManifest() {
    return {
      name: 'dpo2u-compliance',
      version: '1.0.0',
      description: 'Autonomous LGPD/GDPR compliance verification with WDK agent wallets',
      capabilities: [
        {
          name: 'verifyCompliance',
          description: 'Run full compliance audit pipeline for a company',
          parameters: {
            companyId: { type: 'string', required: true },
            framework: { type: 'string', enum: ['lgpd', 'gdpr', 'lgpd_gdpr'], required: true },
            clientAddress: { type: 'string', required: true },
            amount: { type: 'string', description: 'USDT amount in smallest unit', required: true },
          },
        },
        {
          name: 'attestCompliance',
          description: 'Register a compliance attestation on-chain',
          parameters: {
            companyId: { type: 'string', required: true },
            score: { type: 'number', min: 0, max: 100, required: true },
            policyCid: { type: 'string', required: true },
          },
        },
        {
          name: 'checkAgentSolvency',
          description: 'Check solvency status of all compliance agents',
          parameters: {},
        },
      ],
      chains: ['midnight', 'polkadot', 'starknet'],
      walletType: 'wdk-evm',
    };
  }
}
