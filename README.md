# DPO2U WDK Agent

Autonomous compliance agents with WDK wallets, Agent-to-Agent (A2A) USDT payments, and protocol-enforced solvency.

**Tether Hackathon Galaxica: WDK Edition** — Track: Agent Wallets

## Architecture

```
┌─────────────┐    USDT     ┌──────────────────┐
│   Client     │───────────→│  PaymentGateway   │
└─────────────┘             │  (receives USDT)  │
                            └────────┬─────────┘
                                     │ 10% protocol fee
                            ┌────────▼─────────┐
                            │  FeeDistributor   │
                            │  (40/60 ZK split) │
                            └──┬──────────┬────┘
                          36%  │          │ 54%
                    ┌──────────▼┐   ┌─────▼────────┐
                    │  Expert    │   │   Auditor     │
                    │  Agent     │──→│   Agent       │
                    │  (WDK)     │A2A│   (WDK)       │
                    └──────┬────┘   └──────┬────────┘
                           │               │ x402
                    ┌──────▼───────────────▼────────┐
                    │    ComplianceRegistry          │
                    │    (Midnight ZK attestation)   │
                    └───────────────────────────────┘
```

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your seed phrase and RPC URL

# Run tests
npm test

# Run E2E demo
npm run demo

# Test wallet derivation
npm run test:wallet

# Setup agent wallets
npm run setup:agents
```

## Key Components

| Component | Path | Description |
|-----------|------|-------------|
| WDK Wallet Manager | `src/wallet/wdk-wallet.ts` | HD wallet derivation, USDT transfers, balance queries |
| Compliance Agent | `src/agent/compliance-agent.ts` | Base agent with solvency checks and A2A payments |
| Expert Agent | `src/agent/expert-agent.ts` | Accepts jobs, subcontracts auditors, registers attestations |
| Auditor Agent | `src/agent/auditor-agent.ts` | Performs audits, pays compute via x402 |
| Payment Gateway | `src/protocol/payment-gateway.ts` | Client payment reception, protocol fee extraction |
| Fee Distributor | `src/protocol/fee-distributor.ts` | 40/60 expert/auditor split (mirrors Midnight ZK constraint) |
| Agent Registry | `src/protocol/agent-registry.ts` | Agent lifecycle: Active → Probation → Deactivated |
| x402 Client | `src/x402/x402-client.ts` | HTTP 402 compute payments with mock fallback |
| Solvency Monitor | `src/monitor/solvency-monitor.ts` | Continuous solvency enforcement |
| OpenClaw Skill | `src/openclaw/compliance-skill.ts` | Packaged skill for OpenClaw platform |

## Fee Distribution

| Recipient | Share | Of 100 USDT |
|-----------|-------|-------------|
| Protocol Treasury | 10% | 10 USDT |
| Expert Agent | 36% (40% of net) | 36 USDT |
| Auditor Agent | 54% (60% of net) | 54 USDT |

## Integration with Existing Contracts

- **Midnight**: AgentRegistry, ComplianceRegistry, PaymentGateway, FeeDistributor (ZK circuits, 18 tests)
- **Polkadot**: ComplianceRegistry at `0x278B...` (EVM Hub)
- **Starknet**: ComplianceRegistry at `0x052a...` (Cairo)
- **Base Sepolia**: ComplianceRegistry oracle (`dpo2u-base` repo)

## 9 Judging Criteria

1. WDK wallets derived from DID
2. Client pays USDT via WDK
3. Expert verifies solvency
4. A2A payment (Expert → Auditor) without human trigger
5. Auditor pays compute via x402
6. Attestation registered on-chain
7. Fee distribution: 10/36/54 split
8. Post-distribution solvency check
9. Zero human interactions after initial payment

## License

MIT
