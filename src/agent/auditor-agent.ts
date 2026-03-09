/**
 * AuditorAgent — Performs compliance audits, pays compute costs,
 * and returns scored results with policy CIDs.
 */

import { ComplianceAgent } from './compliance-agent.js';
import type { WDKWalletManager } from '../wallet/wdk-wallet.js';
import type { AgentConfig, AuditResult } from '../types.js';
import { X402Client } from '../x402/x402-client.js';

export class AuditorAgent extends ComplianceAgent {
  private x402Client: X402Client;

  constructor(config: AgentConfig, wallet: WDKWalletManager, x402Endpoint?: string) {
    if (config.role !== 'auditor') {
      throw new Error('AuditorAgent requires role "auditor"');
    }
    super(config, wallet);
    this.x402Client = new X402Client(x402Endpoint);
  }

  /**
   * Execute a compliance audit:
   * 1. Verify solvency
   * 2. Pay compute costs via x402/mock
   * 3. Perform audit (simulated)
   * 4. Return score + policy CID
   */
  async executeAudit(companyId: string, evidenceCid: string): Promise<AuditResult> {
    console.log(`[${this.config.did}] Starting audit for ${companyId}`);

    // Step 1: Verify solvency
    const canAccept = await this.acceptJob();
    if (!canAccept) {
      throw new Error(`Auditor ${this.config.did} cannot accept audit: insolvency or inactive`);
    }

    // Step 2: Pay compute costs via x402
    const computeCost = 1_000_000n; // 1 USDT compute cost
    console.log(`[${this.config.did}] Paying compute cost: ${computeCost} via x402`);
    const computeResult = await this.x402Client.payForCompute(
      this.wallet,
      this.config.didIndex,
      `compute://audit/${companyId}`,
      computeCost,
    );
    console.log(`[${this.config.did}] Compute paid: ${computeResult.txHash}`);

    this.emitEvent('compute_paid', {
      agent: this.config.did,
      resource: `compute://audit/${companyId}`,
      cost: computeCost.toString(),
      txHash: computeResult.txHash,
    });

    // Step 3: Perform audit (simulated)
    const score = this.simulateAudit(companyId, evidenceCid);
    const policyCid = `bafybeih${companyId.replace(/[^a-z0-9]/g, '')}policy${score}`;

    console.log(`[${this.config.did}] Audit complete: score=${score}`);

    return {
      companyId,
      score,
      policyCid,
      evidenceCid,
      computeCost,
    };
  }

  /**
   * Simulate audit scoring based on company evidence.
   * In production, this would run actual compliance checks.
   */
  private simulateAudit(companyId: string, _evidenceCid: string): number {
    // Deterministic mock score based on company ID hash
    let hash = 0;
    for (let i = 0; i < companyId.length; i++) {
      hash = ((hash << 5) - hash + companyId.charCodeAt(i)) | 0;
    }
    // Score between 60-100
    return 60 + Math.abs(hash % 41);
  }
}
