import "server-only";

import type { HealthCheckState, HealthNode, TelemetryEntry } from "@/lib/types";
import { bus } from "./eventBus";
import { adminWorker, clusterEndpoints, isRealCluster, probeHealth } from "../lib/cluster";

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1000;
const MISS_THRESHOLD = 2;

const INITIAL_NODES: HealthNode[] = [
  { id: "n1", name: "Node 1", beating: true, missed: 0, healthy: true, inPool: true },
  { id: "n2", name: "Node 2", beating: true, missed: 0, healthy: true, inPool: true },
  { id: "n3", name: "Node 3", beating: true, missed: 0, healthy: true, inPool: true },
  { id: "n4", name: "Node 4", beating: true, missed: 0, healthy: true, inPool: true },
];

// ── Pure transition (exported for vitest) ─────────────────────────────────────

export function applyPoll(node: HealthNode): { next: HealthNode; event: string | null } {
  if (node.beating) {
    const wasUnhealthy = !node.healthy;
    const next: HealthNode = { ...node, missed: 0, healthy: true, inPool: true };
    return {
      next,
      event: wasUnhealthy ? `${node.name} recovered — back in pool.` : null,
    };
  }
  const missed = node.missed + 1;
  const nowUnhealthy = missed >= MISS_THRESHOLD;
  const wasHealthy = node.healthy;
  const next: HealthNode = {
    ...node,
    missed,
    healthy: nowUnhealthy ? false : node.healthy,
    inPool: nowUnhealthy ? false : node.inPool,
  };
  const event =
    nowUnhealthy && wasHealthy
      ? `${node.name} missed ${missed} heartbeats — removed from pool.`
      : null;
  return { next, event };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class HealthCheckEngine {
  private nodes: HealthNode[];
  private log: TelemetryEntry[] = [];
  private logSeq = 0;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  // ── Cluster mode (§9) ───────────────────────────────────────────────────────
  private readonly realCluster = isRealCluster();
  private readonly endpoints = new Map<string, string>(); // nodeId → base URL
  private polling = false; // guards against overlapping async polls

  constructor() {
    const eps = this.realCluster ? clusterEndpoints() : [];
    if (this.realCluster && eps.length > 0) {
      // REAL nodes: one per worker container, polled over the network.
      this.nodes = eps.map((e) => ({
        id: e.id,
        name: e.name,
        beating: true,
        missed: 0,
        healthy: true,
        inPool: true,
      }));
      for (const e of eps) this.endpoints.set(e.id, e.url);
    } else {
      this.nodes = INITIAL_NODES.map((n) => ({ ...n }));
    }
    this.startPolling();
  }

  // ── Public intents ──────────────────────────────────────────────────────────

  silence(id: string): void {
    const node = this.nodes.find((n) => n.id === id);
    if (!node || !node.beating) return;
    node.beating = false;
    this.addLog(`${node.name} heartbeat silenced.`, "warning");
    // REAL: take the worker's /health endpoint offline; the next poll detects it.
    if (this.realCluster) this.pushAdmin(id, { down: true });
    this.publish();
  }

  resume(id: string): void {
    const node = this.nodes.find((n) => n.id === id);
    if (!node || node.beating) return;
    node.beating = true;
    this.addLog(`${node.name} heartbeat resumed.`, "healthy");
    // REAL: bring the worker's /health endpoint back; recovers on the next poll.
    if (this.realCluster) this.pushAdmin(id, { down: false });
    this.publish();
  }

  reset(): void {
    this.stopPolling();
    if (this.realCluster && this.endpoints.size > 0) {
      this.nodes = [...this.endpoints.keys()].map((id) => {
        const prev = this.nodes.find((n) => n.id === id)!;
        return { ...prev, beating: true, missed: 0, healthy: true, inPool: true };
      });
      for (const id of this.endpoints.keys()) this.pushAdmin(id, { down: false });
    } else {
      this.nodes = INITIAL_NODES.map((n) => ({ ...n }));
    }
    this.log = [];
    this.logSeq = 0;
    this.startPolling();
    this.publish();
  }

  snapshot(): HealthCheckState {
    return {
      nodes: this.nodes.map((n) => ({ ...n })),
      cluster: this.realCluster,
      log: [...this.log],
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Fire-and-forget admin toggle to a real worker container (§9). */
  private pushAdmin(id: string, body: { slow?: boolean; down?: boolean }): void {
    const url = this.endpoints.get(id);
    if (url) void adminWorker(url, body);
  }

  private poll(): void {
    if (this.realCluster) {
      void this.pollReal();
      return;
    }
    this.applyPolls();
  }

  /**
   * REAL polling (§9): ping each worker's /health over the network and set
   * `beating` from the genuine result, then run the same pure reducer.
   */
  private async pollReal(): Promise<void> {
    if (this.polling) return; // skip if the previous round is still in flight
    this.polling = true;
    try {
      await Promise.all(
        this.nodes.map(async (node) => {
          const url = this.endpoints.get(node.id);
          if (url) node.beating = await probeHealth(url);
        }),
      );
      this.applyPolls();
    } finally {
      this.polling = false;
    }
  }

  private applyPolls(): void {
    let changed = false;
    this.nodes = this.nodes.map((node) => {
      const { next, event } = applyPoll(node);
      if (event) {
        this.addLog(
          event,
          next.healthy ? "healthy" : "danger",
        );
        changed = true;
      }
      const transitioned =
        next.missed !== node.missed ||
        next.healthy !== node.healthy ||
        next.inPool !== node.inPool;
      if (transitioned) changed = true;
      return next;
    });
    if (changed) this.publish();
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private addLog(message: string, tone: TelemetryEntry["tone"] = "muted"): void {
    const entry: TelemetryEntry = {
      id: ++this.logSeq,
      time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      message,
      tone,
    };
    this.log = [...this.log.slice(-49), entry];
  }

  private publish(): void {
    bus.emit("health-check", this.snapshot());
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────

export const healthEngine = new HealthCheckEngine();
