/**
 * DPO2U WDK Agent — Core Types
 * Mirrors Midnight contract structures for off-chain agent coordination.
 */

export interface AgentConfig {
  did: string;
  didIndex: number;
  role: 'expert' | 'auditor';
  usdtThreshold: bigint;    // minimum USDT balance to accept jobs (6 decimals)
  nightStaked: bigint;       // NIGHT tokens staked in protocol
}

export interface JobRequest {
  clientAddress: string;
  companyId: string;
  amount: bigint;            // USDT total (6 decimals)
  framework: 'lgpd' | 'gdpr' | 'lgpd_gdpr';
}

export interface JobResult {
  companyId: string;
  score: number;             // 0-100
  policyCid: string;         // IPFS CID of audit report
  attestationTx?: string;    // Midnight transaction hash
  expertDid: string;
  auditorDid: string;
  framework: string;
  timestamp: number;
}

export interface AuditResult {
  companyId: string;
  score: number;
  policyCid: string;
  evidenceCid: string;
  computeCost: bigint;
}

export interface FeeDistribution {
  total: bigint;
  protocolFee: bigint;       // 10%
  expertShare: bigint;       // 36% of total (40% of net)
  auditorShare: bigint;      // 54% of total (60% of net)
}

export enum AgentStatus {
  Active = 'active',
  Probation = 'probation',
  Deactivated = 'deactivated',
}

export interface WalletInfo {
  address: string;
  usdtBalance: bigint;
  nativeBalance: bigint;
}

export interface TransferResult {
  txHash: string;
  from: string;
  to: string;
  amount: bigint;
  token: string;
}

export interface ProtocolEvent {
  type: 'payment_received' | 'fee_distributed' | 'agent_paid' | 'solvency_check' | 'status_change' | 'attestation_registered' | 'compute_paid';
  timestamp: number;
  data: Record<string, unknown>;
}

// Reused from dpo2u-midnight/src/types.ts
export function padTo32Bytes(str: string): Uint8Array {
  const buf = Buffer.alloc(32);
  Buffer.from(str, 'utf-8').copy(buf, 0, 0, Math.min(str.length, 32));
  return new Uint8Array(buf);
}

export function bytesToString(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('utf-8').replace(/\0+$/, '');
}

// Fee calculation constants
export const PROTOCOL_FEE_BPS = 1000n;    // 10% in basis points
export const EXPERT_SHARE_BPS = 4000n;    // 40% of net
export const AUDITOR_SHARE_BPS = 6000n;   // 60% of net
export const BPS_DENOMINATOR = 10000n;

export function calculateFeeDistribution(totalAmount: bigint): FeeDistribution {
  const protocolFee = (totalAmount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
  const netAmount = totalAmount - protocolFee;
  const expertShare = (netAmount * EXPERT_SHARE_BPS) / BPS_DENOMINATOR;
  const auditorShare = netAmount - expertShare; // remainder to avoid rounding loss

  return {
    total: totalAmount,
    protocolFee,
    expertShare,
    auditorShare,
  };
}
