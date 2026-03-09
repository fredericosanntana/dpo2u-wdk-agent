/**
 * SolvencyMonitor — Continuously monitors agent solvency
 * and enforces lifecycle transitions.
 */

import type { AgentRegistry } from '../protocol/agent-registry.js';
import { AgentStatus } from '../types.js';

export class SolvencyMonitor {
  private registry: AgentRegistry;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private checkCount = 0;

  constructor(registry: AgentRegistry, intervalMs: number = 30_000) {
    this.registry = registry;
    this.intervalMs = intervalMs;
  }

  /**
   * Start continuous monitoring loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    console.log(`[SolvencyMonitor] Starting (interval: ${this.intervalMs}ms)`);

    this.timer = setInterval(async () => {
      await this.runCheck();
    }, this.intervalMs);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log(`[SolvencyMonitor] Stopped after ${this.checkCount} checks`);
  }

  /**
   * Run a single solvency check across all agents.
   */
  async runCheck(): Promise<{
    checked: number;
    active: number;
    probation: number;
    deactivated: number;
  }> {
    this.checkCount++;
    const agents = this.registry.getAllAgents();

    let active = 0;
    let probation = 0;
    let deactivated = 0;

    for (const agent of agents) {
      if (agent.status === AgentStatus.Deactivated) {
        deactivated++;
        continue;
      }

      await this.registry.checkPostJobSolvency(agent);

      switch (agent.status) {
        case AgentStatus.Active:
          active++;
          break;
        case AgentStatus.Probation:
          probation++;
          break;
        case AgentStatus.Deactivated:
          deactivated++;
          break;
      }
    }

    // Enforce probation timeouts
    this.registry.enforceTimeouts();

    const result = { checked: agents.length, active, probation, deactivated };
    console.log(`[SolvencyMonitor] Check #${this.checkCount}: ${JSON.stringify(result)}`);
    return result;
  }

  isRunning(): boolean {
    return this.running;
  }

  getCheckCount(): number {
    return this.checkCount;
  }
}
