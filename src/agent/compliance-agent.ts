/**
 * ComplianceAgent — Base class for all DPO2U autonomous agents.
 * Manages WDK wallet, solvency checks, and A2A payments.
 */

import type { WDKWalletManager } from '../wallet/wdk-wallet.js';
import type { AgentConfig, WalletInfo, TransferResult, ProtocolEvent } from '../types.js';
import { AgentStatus } from '../types.js';

export class ComplianceAgent {
  readonly config: AgentConfig;
  protected wallet: WDKWalletManager;
  private _status: AgentStatus = AgentStatus.Active;
  private eventLog: ProtocolEvent[] = [];
  private _consecutiveFailures: number = 0;

  constructor(config: AgentConfig, wallet: WDKWalletManager) {
    this.config = config;
    this.wallet = wallet;
    this._consecutiveFailures = config.consecutiveFailures ?? 0;
  }

  get consecutiveFailures(): number {
    return this._consecutiveFailures;
  }

  get status(): AgentStatus {
    return this._status;
  }

  set status(newStatus: AgentStatus) {
    const oldStatus = this._status;
    this._status = newStatus;
    this.emitEvent('status_change', {
      agent: this.config.did,
      from: oldStatus,
      to: newStatus,
    });
  }

  get address(): string {
    return this.wallet.getAgentAddress(this.config.didIndex);
  }

  /**
   * Check if agent has sufficient USDT to operate.
   */
  async checkSolvency(): Promise<boolean> {
    const balance = await this.getBalance();
    const solvent = balance.usdtBalance >= this.config.usdtThreshold;
    this.emitEvent('solvency_check', {
      agent: this.config.did,
      balance: balance.usdtBalance.toString(),
      threshold: this.config.usdtThreshold.toString(),
      solvent,
    });
    return solvent;
  }

  /**
   * Accept a job only if solvent and active.
   */
  async acceptJob(): Promise<boolean> {
    if (this._status !== AgentStatus.Active) {
      console.log(`[${this.config.did}] Cannot accept job: status is ${this._status}`);
      return false;
    }
    const solvent = await this.checkSolvency();
    if (!solvent) {
      console.log(`[${this.config.did}] Cannot accept job: insufficient balance`);
      return false;
    }
    return true;
  }

  /**
   * Get full wallet info.
   */
  async getBalance(): Promise<WalletInfo> {
    return this.wallet.getWalletInfo(this.config.didIndex);
  }

  /**
   * Record a payment failure — increments consecutive failure counter (PRD §4.5).
   */
  recordPaymentFailure(): void {
    this._consecutiveFailures++;
    this.emitEvent('payment_failure', {
      agent: this.config.did,
      consecutiveFailures: this._consecutiveFailures,
    });
    console.log(`[${this.config.did}] Payment failure #${this._consecutiveFailures}`);
  }

  /**
   * Record a payment success — resets consecutive failure counter (PRD §4.5).
   */
  recordPaymentSuccess(): void {
    this._consecutiveFailures = 0;
  }

  /**
   * Pay another agent via A2A WDK transfer.
   * Tracks consecutive failures/successes per PRD §4.5.
   */
  async payAgent(targetAddress: string, amount: bigint): Promise<TransferResult> {
    console.log(`[${this.config.did}] Paying ${amount} USDT to ${targetAddress}`);
    try {
      const result = await this.wallet.sendUSDT(this.config.didIndex, targetAddress, amount);
      this.recordPaymentSuccess();
      this.emitEvent('agent_paid', {
        from: this.config.did,
        to: targetAddress,
        amount: amount.toString(),
        txHash: result.txHash,
      });
      return result;
    } catch (error) {
      this.recordPaymentFailure();
      throw error;
    }
  }

  protected emitEvent(type: ProtocolEvent['type'], data: Record<string, unknown>): void {
    const event: ProtocolEvent = {
      type,
      timestamp: Date.now(),
      data,
    };
    this.eventLog.push(event);
  }

  getEventLog(): ProtocolEvent[] {
    return [...this.eventLog];
  }
}
