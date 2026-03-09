import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { MockWDKWalletManager } from '../src/wallet/wdk-wallet.js';

const SEED = 'test test test test test test test test test test test junk';

describe('WDKWalletManager', () => {
  it('should derive deterministic addresses from seed', () => {
    const wallet1 = new MockWDKWalletManager(SEED);
    const wallet2 = new MockWDKWalletManager(SEED);

    for (let i = 0; i < 3; i++) {
      assert.equal(wallet1.getAgentAddress(i), wallet2.getAgentAddress(i));
    }
  });

  it('should derive different addresses for different indices', () => {
    const wallet = new MockWDKWalletManager(SEED);
    const addr0 = wallet.getAgentAddress(0);
    const addr1 = wallet.getAgentAddress(1);
    const addr2 = wallet.getAgentAddress(2);

    assert.notEqual(addr0, addr1);
    assert.notEqual(addr1, addr2);
    assert.notEqual(addr0, addr2);
  });

  it('should return valid EVM addresses', () => {
    const wallet = new MockWDKWalletManager(SEED);
    for (let i = 0; i < 3; i++) {
      const addr = wallet.getAgentAddress(i);
      assert.match(addr, /^0x[0-9a-fA-F]{40}$/);
    }
  });

  it('should track mock USDT balances', async () => {
    const wallet = new MockWDKWalletManager(SEED);
    wallet.setMockBalance(0, 1000_000_000n);

    const balance = await wallet.getUSDTBalance(0);
    assert.equal(balance, 1000_000_000n);
  });

  it('should transfer USDT between wallets', async () => {
    const wallet = new MockWDKWalletManager(SEED);
    wallet.setMockBalance(0, 100_000_000n);

    const toAddress = wallet.getAgentAddress(1);
    const result = await wallet.sendUSDT(0, toAddress, 30_000_000n);

    assert.equal(result.amount, 30_000_000n);
    assert.equal(result.token, 'USDT');

    const senderBalance = await wallet.getUSDTBalance(0);
    assert.equal(senderBalance, 70_000_000n);

    const receiverBalance = wallet.getMockBalance(toAddress);
    assert.equal(receiverBalance, 30_000_000n);
  });

  it('should reject transfer with insufficient balance', async () => {
    const wallet = new MockWDKWalletManager(SEED);
    wallet.setMockBalance(0, 10_000_000n);

    const toAddress = wallet.getAgentAddress(1);
    await assert.rejects(
      () => wallet.sendUSDT(0, toAddress, 50_000_000n),
      /Insufficient USDT balance/,
    );
  });

  it('should track transfer log', async () => {
    const wallet = new MockWDKWalletManager(SEED);
    wallet.setMockBalance(0, 100_000_000n);

    const addr1 = wallet.getAgentAddress(1);
    const addr2 = wallet.getAgentAddress(2);

    await wallet.sendUSDT(0, addr1, 20_000_000n);
    await wallet.sendUSDT(0, addr2, 30_000_000n);

    const log = wallet.getTransferLog();
    assert.equal(log.length, 2);
    assert.equal(log[0].amount, 20_000_000n);
    assert.equal(log[1].amount, 30_000_000n);
  });

  it('should return wallet info', async () => {
    const wallet = new MockWDKWalletManager(SEED);
    wallet.setMockBalance(0, 50_000_000n, 1_000_000_000_000_000_000n);

    const info = await wallet.getWalletInfo(0);
    assert.equal(info.usdtBalance, 50_000_000n);
    assert.equal(info.nativeBalance, 1_000_000_000_000_000_000n);
    assert.match(info.address, /^0x[0-9a-fA-F]{40}$/);
  });
});
