/**
 * AgentRegistry — Manages agent lifecycle and solvency enforcement.
 * Mirrors the Midnight AgentRegistry.compact contract pattern.
 */

import type { ComplianceAgent } from '../agent/compliance-agent.js';
import type { ProtocolEvent } from '../types.js';
import { AgentStatus } from '../types.js';

interface RegisteredAgent {
  agent: ComplianceAgent;
  registeredAt: number;
  probationStartedAt?: number;
}

const PROBATION_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48 hours

export class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();
  private eventLog: ProtocolEvent[] = [];

  /**
   * Register an agent with its solvency threshold.
   */
  registerAgent(agent: ComplianceAgent): void {
    if (this.agents.has(agent.config.did)) {
      throw new Error(`Agent ${agent.config.did} already registered`);
    }

    this.agents.set(agent.config.did, {
      agent,
      registeredAt: Date.now(),
    });

    console.log(`[AgentRegistry] Registered: ${agent.config.did} (${agent.config.role}), threshold=${agent.config.usdtThreshold}`);
  }

  /**
   * Check solvency after a job and transition status if needed.
   * Probation triggered by balance < threshold OR 2+ consecutive payment failures (PRD §4.5).
   */
  async checkPostJobSolvency(agent: ComplianceAgent): Promise<boolean> {
    const solvent = await agent.checkSolvency();
    const hasExcessiveFailures = agent.consecutiveFailures >= 2;

    if (agent.status === AgentStatus.Active && (!solvent || hasExcessiveFailures)) {
      const reason = !solvent ? 'insufficient balance' : `${agent.consecutiveFailures} consecutive payment failures`;
      this.setProbation(agent, reason);
    } else if (solvent && !hasExcessiveFailures && agent.status === AgentStatus.Probation) {
      // Agent recovered solvency and no excessive failures
      agent.status = AgentStatus.Active;
      const reg = this.agents.get(agent.config.did);
      if (reg) {
        reg.probationStartedAt = undefined;
      }
      console.log(`[AgentRegistry] ${agent.config.did} recovered solvency → Active`);
    }

    return solvent && !hasExcessiveFailures;
  }

  /**
   * Set agent to probation status.
   */
  setProbation(agent: ComplianceAgent, reason: string = 'insufficient balance'): void {
    agent.status = AgentStatus.Probation;
    const reg = this.agents.get(agent.config.did);
    if (reg) {
      reg.probationStartedAt = Date.now();
    }
    console.log(`[AgentRegistry] ${agent.config.did} → Probation (${reason})`);

    this.emitEvent('status_change', {
      agent: agent.config.did,
      newStatus: AgentStatus.Probation,
      reason,
    });
  }

  /**
   * Deactivate agent (after 48h probation timeout or manual).
   */
  deactivateAgent(agent: ComplianceAgent): void {
    agent.status = AgentStatus.Deactivated;
    console.log(`[AgentRegistry] ${agent.config.did} → Deactivated`);

    this.emitEvent('status_change', {
      agent: agent.config.did,
      newStatus: AgentStatus.Deactivated,
    });
  }

  /**
   * Check all agents in probation and deactivate if timeout exceeded.
   */
  enforceTimeouts(): void {
    const now = Date.now();
    for (const [did, reg] of this.agents) {
      if (
        reg.agent.status === AgentStatus.Probation &&
        reg.probationStartedAt &&
        now - reg.probationStartedAt >= PROBATION_TIMEOUT_MS
      ) {
        console.log(`[AgentRegistry] ${did} probation timeout exceeded → Deactivating`);
        this.deactivateAgent(reg.agent);
      }
    }
  }

  /**
   * Get all active agents.
   */
  getActiveAgents(): ComplianceAgent[] {
    return Array.from(this.agents.values())
      .filter((r) => r.agent.status === AgentStatus.Active)
      .map((r) => r.agent);
  }

  /**
   * Get all registered agents.
   */
  getAllAgents(): ComplianceAgent[] {
    return Array.from(this.agents.values()).map((r) => r.agent);
  }

  /**
   * Get agent by DID.
   */
  getAgent(did: string): ComplianceAgent | undefined {
    return this.agents.get(did)?.agent;
  }

  private emitEvent(type: ProtocolEvent['type'], data: Record<string, unknown>): void {
    this.eventLog.push({ type, timestamp: Date.now(), data });
  }

  getEventLog(): ProtocolEvent[] {
    return [...this.eventLog];
  }
}
