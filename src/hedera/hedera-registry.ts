/**
 * Hedera ComplianceRegistryExtended — ethers.js wrapper
 *
 * Provides read access to the ComplianceRegistryExtended contract deployed
 * on Hedera Testnet via the dpo2u-relayer.
 */

import { ethers } from 'ethers';

// Minimal ABI for read operations + relay function
const REGISTRY_ABI = [
  'function attestationExists(bytes32 attestationId) external view returns (bool)',
  'function attestationCount() external view returns (uint256)',
  'function admin() external view returns (address)',
  'function trustedRelayer() external view returns (address)',
  `function getAttestation(bytes32 attestationId) external view returns (
    tuple(
      bytes32 orgHash,
      string regulation,
      uint256 score,
      uint256 validUntil,
      bytes32 agentDid,
      string evidenceCid,
      bytes32 commitment,
      string source,
      uint256 timestamp,
      bool exists
    )
  )`,
  `function registerAttestationFromMidnight(
    bytes32 attestationId,
    bytes32 orgHash,
    string calldata regulation,
    uint256 score,
    uint256 validUntil,
    bytes32 agentDid,
    string calldata evidenceCid,
    bytes32 commitment
  ) external returns (bool)`,
  `event AttestationRelayed(
    bytes32 indexed attestationId,
    bytes32 indexed orgHash,
    string regulation,
    uint256 score,
    string source
  )`,
];

export interface HederaAttestation {
  orgHash: string;
  regulation: string;
  score: number;
  validUntil: number;
  agentDid: string;
  evidenceCid: string;
  commitment: string;
  source: string;
  timestamp: number;
  exists: boolean;
}

export class HederaComplianceRegistry {
  private contract: ethers.Contract;
  private provider: ethers.JsonRpcProvider;

  constructor(
    registryAddress: string,
    rpcUrl: string = 'https://testnet.hashio.io/api',
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl, {
      chainId: 296,
      name: 'hedera-testnet',
    });
    this.contract = new ethers.Contract(registryAddress, REGISTRY_ABI, this.provider);
  }

  /**
   * Check if an organization has a valid compliance attestation.
   */
  async isCompliant(attestationId: string, minScore: number = 60): Promise<boolean> {
    const att = await this.getAttestation(attestationId);
    if (!att.exists) return false;
    if (att.score < minScore) return false;
    if (att.validUntil > 0 && att.validUntil < Math.floor(Date.now() / 1000)) return false;
    return true;
  }

  /**
   * Get the compliance score for an attestation.
   */
  async getScore(attestationId: string): Promise<number> {
    const att = await this.getAttestation(attestationId);
    return att.score;
  }

  /**
   * Get full attestation details by ID.
   */
  async getAttestation(attestationId: string): Promise<HederaAttestation> {
    const padded = padBytes32(attestationId);
    const result = await this.contract.getAttestation(padded);

    return {
      orgHash: result.orgHash,
      regulation: result.regulation,
      score: Number(result.score),
      validUntil: Number(result.validUntil),
      agentDid: result.agentDid,
      evidenceCid: result.evidenceCid,
      commitment: result.commitment,
      source: result.source,
      timestamp: Number(result.timestamp),
      exists: result.exists,
    };
  }

  /**
   * Check if an attestation exists on-chain (idempotency check).
   */
  async attestationExists(attestationId: string): Promise<boolean> {
    const padded = padBytes32(attestationId);
    return this.contract.attestationExists(padded);
  }

  /**
   * Get total attestation count on Hedera.
   */
  async getAttestationCount(): Promise<number> {
    const count = await this.contract.attestationCount();
    return Number(count);
  }

  /**
   * Get a Contract instance with signer for write operations.
   */
  getSignedContract(privateKey: string): ethers.Contract {
    const signer = new ethers.Wallet(privateKey, this.provider);
    return new ethers.Contract(this.contract.target as string, REGISTRY_ABI, signer);
  }
}

function padBytes32(value: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  return '0x' + clean.padStart(64, '0').slice(0, 64);
}
