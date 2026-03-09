# DPO2U WDK Agent — Hackathon Submission

## Tether Hackathon Galaxica: WDK Edition
**Track:** Agent Wallets

## Project Summary

DPO2U WDK Agent implements autonomous compliance agents with Tether WDK wallets that perform LGPD/GDPR compliance audits entirely without human intervention. Agents hold their own wallets, make Agent-to-Agent (A2A) payments in USDT, and enforce solvency constraints through protocol-level monitoring.

## Judging Criteria Alignment

### 1. Agent Wallet Integration
- Each agent (Expert, Auditor) derives a deterministic EVM wallet from a shared seed phrase via HD derivation (BIP-44 path)
- WDK wallet manager handles USDT ERC-20 operations natively
- Treasury wallet at index 0, Expert at index 1, Auditor at index 2

### 2. A2A (Agent-to-Agent) Payments
- Expert subcontracts Auditor with 50% upfront USDT via `payAgent()`
- All transfers are real ERC-20 USDT transfers (or mock for demo)
- No human approval needed for A2A transfers

### 3. Solvency Enforcement
- Each agent has a `usdtThreshold` — minimum balance to accept jobs
- `SolvencyMonitor` continuously checks balances
- Lifecycle: Active → Probation (insufficient funds) → Deactivated (48h timeout)
- Agents in Probation cannot accept new jobs

### 4. Protocol Fee Distribution
- 10% protocol fee to treasury (mirrors Midnight PaymentGateway)
- 40/60 split between Expert/Auditor (mirrors Midnight FeeDistributor ZK constraint)
- All distributions via WDK USDT transfers

### 5. x402 Compute Payments
- Auditor pays for compute resources via HTTP 402 protocol
- Graceful fallback to mock payment when x402 endpoint unavailable
- Cost tracked and logged per audit

### 6. Zero Human Interaction
- Complete flow from client payment to attestation with zero manual steps
- All decisions (accept/reject job, pay auditor, distribute fees) are autonomous
- Solvency enforcement is automatic

### 7. Multi-Chain Integration
- Midnight: ZK circuits for AgentRegistry, ComplianceRegistry, PaymentGateway, FeeDistributor
- Polkadot EVM Hub: ComplianceRegistry (Solidity, deployed)
- Starknet: ComplianceRegistry (Cairo, deployed)
- Oracle integration for cross-chain compliance verification

### 8. OpenClaw Skill
- Packaged as OpenClaw skill with standard manifest
- Exposes: `verifyCompliance()`, `attestCompliance()`, `checkAgentSolvency()`
- Ready for marketplace integration

### 9. Test Coverage
- Unit tests: wallet, agent, protocol modules
- E2E test: full pipeline with all 9 criteria
- Demo script: visual demonstration of complete flow

## Technical Stack

- **Runtime:** Node.js with ESM, TypeScript
- **Wallet:** Tether WDK (EVM), ethers.js for ERC-20 operations
- **Contracts:** Midnight Compact, Solidity (Polkadot), Cairo (Starknet)
- **Payments:** USDT ERC-20, x402 protocol
- **Testing:** Node.js native test runner

## How to Run

```bash
npm install
npm test        # Run all tests
npm run demo    # Run E2E demo with all 9 criteria
```

## Team

- **DPO2U** — Privacy-preserving compliance infrastructure

## Repository

- `dpo2u-wdk-agent/` — This project (WDK Agent)
- `dpo2u-midnight/` — Midnight ZK contracts (4 contracts, 25 tests)
- `dpo2u-polkadot/` — Polkadot ComplianceRegistry
- `dpo2u-starknet/` — Starknet ComplianceRegistry
