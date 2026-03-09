/**
 * ExpertAgent — Compliance expert that receives client jobs,
 * subcontracts auditors, and registers attestations.
 */

import { ComplianceAgent } from './compliance-agent.js';
import type { AuditorAgent } from './auditor-agent.js';
import type { WDKWalletManager } from '../wallet/wdk-wallet.js';
import type { AgentConfig, JobRequest, JobResult } from '../types.js';

export class ExpertAgent extends ComplianceAgent {
  constructor(config: AgentConfig, wallet: WDKWalletManager) {
    if (config.role !== 'expert') {
      throw new Error('ExpertAgent requires role "expert"');
    }
    super(config, wallet);
  }

  /**
   * Execute a compliance job end-to-end:
   * 1. Verify own solvency
   * 2. Calculate subcontract fee (50% upfront to auditor)
   * 3. Pay auditor via A2A WDK transfer
   * 4. Await auditor result
   * 5. Register attestation (mock Midnight)
   * 6. Return result
   */
  async executeJob(job: JobRequest, auditor: AuditorAgent): Promise<JobResult> {
    console.log(`\n[${this.config.did}] === Starting job for ${job.companyId} ===`);

    // Step 1: Verify solvency
    const canAccept = await this.acceptJob();
    if (!canAccept) {
      throw new Error(`Expert ${this.config.did} cannot accept job: insolvency or inactive`);
    }
    console.log(`[${this.config.did}] Solvency verified, accepting job`);

    // Step 2: Calculate subcontract (50% upfront to auditor)
    const auditorUpfront = job.amount / 2n;
    console.log(`[${this.config.did}] Subcontract: ${auditorUpfront} USDT upfront to auditor`);

    // Step 3: Pay auditor via A2A transfer
    const paymentResult = await this.payAgent(auditor.address, auditorUpfront);
    console.log(`[${this.config.did}] Paid auditor: tx ${paymentResult.txHash}`);

    // Step 4: Await auditor result
    const evidenceCid = `bafybeih${job.companyId.replace(/[^a-z0-9]/g, '')}evidence`;
    console.log(`[${this.config.did}] Requesting audit from ${auditor.config.did}`);
    const auditResult = await auditor.executeAudit(job.companyId, evidenceCid);
    console.log(`[${this.config.did}] Audit complete: score=${auditResult.score}, cid=${auditResult.policyCid}`);

    // Step 5: Register attestation (mock Midnight call)
    const attestationTx = await this.registerAttestation(
      job.companyId,
      auditResult.score,
      auditResult.policyCid,
    );
    console.log(`[${this.config.did}] Attestation registered: ${attestationTx}`);

    // Step 6: Build and return result
    const result: JobResult = {
      companyId: job.companyId,
      score: auditResult.score,
      policyCid: auditResult.policyCid,
      attestationTx,
      expertDid: this.config.did,
      auditorDid: auditor.config.did,
      framework: job.framework,
      timestamp: Date.now(),
    };

    this.emitEvent('attestation_registered', {
      companyId: job.companyId,
      score: auditResult.score,
      policyCid: auditResult.policyCid,
      txHash: attestationTx,
    });

    console.log(`[${this.config.did}] === Job complete for ${job.companyId} ===\n`);
    return result;
  }

  /**
   * Register attestation on Midnight (mock for demo).
   * In production, this calls ComplianceRegistry.registerAttestation().
   */
  private async registerAttestation(
    companyId: string,
    score: number,
    policyCid: string,
  ): Promise<string> {
    // Mock Midnight transaction
    const mockTxHash = `0xmidnight_${companyId}_${score}_${Date.now().toString(16)}`;
    console.log(`[${this.config.did}] Mock Midnight registerAttestation(${companyId}, ${this.config.did}, ${policyCid}, ${score})`);
    return mockTxHash;
  }
}
