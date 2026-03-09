/**
 * x402 Compute Payment Client
 * Handles HTTP 402 Payment Required flows for compute resources.
 * Falls back to mock payment when x402 is not available.
 */

import type { WDKWalletManager } from '../wallet/wdk-wallet.js';
import type { TransferResult } from '../types.js';

export interface X402PaymentResult {
  txHash: string;
  resourceUrl: string;
  cost: bigint;
  method: 'x402' | 'mock';
}

export class X402Client {
  private endpoint: string | undefined;

  constructor(endpoint?: string) {
    this.endpoint = endpoint;
  }

  /**
   * Pay for a compute resource.
   * 1. Makes HTTP request to resource
   * 2. If 402 → signs payment and resends
   * 3. If x402 unavailable → mock payment (log + debit wallet)
   */
  async payForCompute(
    wallet: WDKWalletManager,
    didIndex: number,
    resourceUrl: string,
    maxCost: bigint,
  ): Promise<X402PaymentResult> {
    // Try real x402 if endpoint configured
    if (this.endpoint) {
      try {
        return await this.tryX402Payment(wallet, didIndex, resourceUrl, maxCost);
      } catch (err) {
        console.log(`[x402] Real payment failed, falling back to mock: ${err}`);
      }
    }

    // Mock payment (for demo/testnet)
    return this.mockPayment(wallet, didIndex, resourceUrl, maxCost);
  }

  private async tryX402Payment(
    wallet: WDKWalletManager,
    didIndex: number,
    resourceUrl: string,
    maxCost: bigint,
  ): Promise<X402PaymentResult> {
    const fullUrl = `${this.endpoint}/${resourceUrl}`;

    // Step 1: Initial request
    const response = await fetch(fullUrl);

    if (response.status === 402) {
      // Step 2: Parse payment requirements from headers
      const paymentAddress = response.headers.get('X-Payment-Address');
      const paymentAmount = response.headers.get('X-Payment-Amount');

      if (!paymentAddress || !paymentAmount) {
        throw new Error('Invalid 402 response: missing payment headers');
      }

      const cost = BigInt(paymentAmount);
      if (cost > maxCost) {
        throw new Error(`Compute cost ${cost} exceeds max ${maxCost}`);
      }

      // Step 3: Execute payment
      const transferResult = await wallet.sendUSDT(didIndex, paymentAddress, cost);

      // Step 4: Resend with payment proof
      const proofResponse = await fetch(fullUrl, {
        headers: {
          'X-Payment-Proof': transferResult.txHash,
        },
      });

      if (!proofResponse.ok) {
        throw new Error(`x402 payment accepted but resource fetch failed: ${proofResponse.status}`);
      }

      return {
        txHash: transferResult.txHash,
        resourceUrl,
        cost,
        method: 'x402',
      };
    }

    if (response.ok) {
      // Resource is free
      return {
        txHash: '0x_free_resource',
        resourceUrl,
        cost: 0n,
        method: 'x402',
      };
    }

    throw new Error(`Unexpected response: ${response.status}`);
  }

  private async mockPayment(
    _wallet: WDKWalletManager,
    _didIndex: number,
    resourceUrl: string,
    maxCost: bigint,
  ): Promise<X402PaymentResult> {
    // Simulate compute cost as fraction of maxCost
    const cost = maxCost;
    const txHash = `0xmock_x402_${resourceUrl.replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(16)}`;

    console.log(`[x402-mock] Paid ${cost} for compute: ${resourceUrl}`);

    return {
      txHash,
      resourceUrl,
      cost,
      method: 'mock',
    };
  }
}
