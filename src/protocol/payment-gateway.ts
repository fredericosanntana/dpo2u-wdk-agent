/**
 * PaymentGateway — Receives client USDT payments and extracts protocol fees.
 * Mirrors the Midnight PaymentGateway.compact contract pattern.
 */

import type { WDKWalletManager } from '../wallet/wdk-wallet.js';
import type { TransferResult, ProtocolEvent, FeeDistribution } from '../types.js';
import { calculateFeeDistribution } from '../types.js';

export class PaymentGateway {
  private wallet: WDKWalletManager;
  private treasuryDidIndex: number;
  private eventLog: ProtocolEvent[] = [];
  private totalReceived: bigint = 0n;
  private totalProtocolFees: bigint = 0n;

  constructor(wallet: WDKWalletManager, treasuryDidIndex: number) {
    this.wallet = wallet;
    this.treasuryDidIndex = treasuryDidIndex;
  }

  get treasuryAddress(): string {
    return this.wallet.getAgentAddress(this.treasuryDidIndex);
  }

  /**
   * Receive payment from client.
   * In production, client sends USDT to the treasury address.
   * Here we simulate by crediting the treasury.
   */
  async receivePayment(clientAddress: string, amount: bigint): Promise<{
    distribution: FeeDistribution;
    txHash: string;
  }> {
    if (amount <= 0n) {
      throw new Error('Payment amount must be greater than zero');
    }

    console.log(`[PaymentGateway] Receiving ${amount} USDT from client ${clientAddress}`);

    // Calculate fee distribution
    const distribution = calculateFeeDistribution(amount);

    this.totalReceived += amount;
    this.totalProtocolFees += distribution.protocolFee;

    const txHash = `0xpay_${clientAddress.slice(0, 8)}_${Date.now().toString(16)}`;

    this.emitEvent('payment_received', {
      client: clientAddress,
      amount: amount.toString(),
      protocolFee: distribution.protocolFee.toString(),
      distributable: (distribution.expertShare + distribution.auditorShare).toString(),
      txHash,
    });

    console.log(`[PaymentGateway] Fee breakdown: protocol=${distribution.protocolFee}, expert=${distribution.expertShare}, auditor=${distribution.auditorShare}`);

    return { distribution, txHash };
  }

  /**
   * Extract protocol fee from a payment amount.
   */
  extractProtocolFee(amount: bigint): bigint {
    return calculateFeeDistribution(amount).protocolFee;
  }

  /**
   * Get distributable amount after protocol fee.
   */
  getDistributableAmount(amount: bigint): bigint {
    const dist = calculateFeeDistribution(amount);
    return dist.expertShare + dist.auditorShare;
  }

  /**
   * Get treasury balance.
   */
  async getTreasuryBalance(): Promise<bigint> {
    const info = await this.wallet.getWalletInfo(this.treasuryDidIndex);
    return info.usdtBalance;
  }

  getStats(): { totalReceived: bigint; totalProtocolFees: bigint } {
    return {
      totalReceived: this.totalReceived,
      totalProtocolFees: this.totalProtocolFees,
    };
  }

  private emitEvent(type: ProtocolEvent['type'], data: Record<string, unknown>): void {
    this.eventLog.push({ type, timestamp: Date.now(), data });
  }

  getEventLog(): ProtocolEvent[] {
    return [...this.eventLog];
  }
}
