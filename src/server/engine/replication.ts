import "server-only";

import type { Replica, ReplicationMode, ReplicationState, TelemetryEntry } from "@/lib/types";
import { bus } from "./eventBus";
import { adminWorker, callWork, clusterEndpoints, isRealCluster } from "../lib/cluster";

// Replication uses the first three worker containers as replicas (§9).
const REAL_REPLICA_COUNT = 3;

// ── Pure transition helpers (exported for vitest) ─────────────────────────────

export function applyActiveCommand(
  replicas: Replica[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _command: string,
): Replica[] {
  return replicas.map((r) =>
    r.alive ? { ...r, ops: r.ops + 1 } : r,
  );
}

export function applyPassiveCommand(
  replicas: Replica[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _command: string,
): Replica[] {
  return replicas.map((r) => {
    if (!r.alive) return r;
    if (r.role === "primary") return { ...r, ops: r.ops + 1, walEntries: r.walEntries + 1 };
    return { ...r, walEntries: r.walEntries + 1 };
  });
}

export function electNewPrimary(replicas: Replica[]): Replica[] {
  const aliveBackups = replicas.filter((r) => r.alive && r.role === "backup");
  if (aliveBackups.length === 0) return replicas;
  // Elect the backup with the most WAL entries (highest durability).
  const elected = aliveBackups.reduce((best, r) =>
    r.walEntries >= best.walEntries ? r : best,
  );
  return replicas.map((r) => ({
    ...r,
    role: r.id === elected.id ? "primary" : r.role === "primary" ? "backup" : r.role,
  }));
}

// ── Engine ────────────────────────────────────────────────────────────────────

const INITIAL_REPLICAS: Replica[] = [
  { id: "r0", name: "R0", role: "primary", alive: true, ops: 0, walEntries: 0 },
  { id: "r1", name: "R1", role: "backup",  alive: true, ops: 0, walEntries: 0 },
  { id: "r2", name: "R2", role: "backup",  alive: true, ops: 0, walEntries: 0 },
];

export class ReplicationEngine {
  private mode: ReplicationMode = "active";
  private replicas: Replica[];
  private lastCommand: string | null = null;
  private electing = false;
  private log: TelemetryEntry[] = [];
  private logSeq = 0;

  // ── Cluster mode (§9) ───────────────────────────────────────────────────────
  // Honest scope: this gives REAL replica processes, REAL "apply" round-trips, and
  // REAL crashes/failover across containers — but the WAL shipping and leader
  // election are SIMPLIFIED in the gateway, not a production consensus protocol.
  private readonly realCluster: boolean;
  private readonly endpoints = new Map<string, string>(); // replicaId → base URL

  constructor() {
    const eps = isRealCluster() ? clusterEndpoints().slice(0, REAL_REPLICA_COUNT) : [];
    this.realCluster = eps.length === REAL_REPLICA_COUNT;
    if (this.realCluster) {
      // Each replica is a real worker container (named after it).
      this.replicas = INITIAL_REPLICAS.map((r, i) => ({ ...r, name: eps[i].name }));
      INITIAL_REPLICAS.forEach((r, i) => this.endpoints.set(r.id, eps[i].url));
    } else {
      this.replicas = INITIAL_REPLICAS.map((r) => ({ ...r }));
    }
  }

  private freshReplicas(): Replica[] {
    return INITIAL_REPLICAS.map((r, i) => ({
      ...r,
      name: this.realCluster ? this.replicas[i]?.name ?? r.name : r.name,
    }));
  }

  setMode(mode: ReplicationMode): void {
    this.mode = mode;
    this.replicas = this.freshReplicas();
    this.lastCommand = null;
    this.electing = false;
    // REAL: bring every replica container back into service.
    if (this.realCluster) this.reviveAll();
    this.addLog(`Mode → ${mode}. Replicas reset.`, "flow");
    this.publish();
  }

  sendCommand(command: string): void {
    if (this.realCluster) {
      this.sendCommandReal(command);
      return;
    }
    if (this.mode === "active") {
      this.replicas = applyActiveCommand(this.replicas, command);
      const alive = this.replicas.filter((r) => r.alive).length;
      this.addLog(
        `"${command}" applied to all ${alive} alive replica(s).`,
        "healthy",
      );
    } else {
      const primary = this.replicas.find((r) => r.role === "primary" && r.alive);
      if (!primary) {
        this.addLog(`No primary available — command dropped.`, "danger");
        this.publish();
        return;
      }
      this.replicas = applyPassiveCommand(this.replicas, command);
      const backups = this.replicas.filter((r) => r.role === "backup" && r.alive).length;
      this.addLog(
        `"${command}" applied on primary → WAL shipped to ${backups} backup(s).`,
        "healthy",
      );
    }
    this.lastCommand = command;
    this.publish();
  }

  killReplica(id: string): void {
    const r = this.replicas.find((r) => r.id === id);
    if (!r || !r.alive) return;
    const wasPrimary = r.role === "primary";
    // REAL: take the replica's container out of service (a genuine process crash
    // as far as the gateway can observe — /work + /health stop answering).
    if (this.realCluster) this.pushAdmin(id, { down: true });
    this.replicas = this.replicas.map((x) =>
      x.id === id ? { ...x, alive: false } : x,
    );
    this.addLog(
      this.realCluster ? `${r.name} killed (container taken down).` : `${r.name} killed.`,
      "danger",
    );

    if (wasPrimary && this.mode === "passive") {
      this.electing = true;
      this.addLog("Primary lost — running election…", "warning");
      this.publish();
      // Brief delay to visualise the election, then promote.
      setTimeout(() => {
        this.replicas = electNewPrimary(this.replicas);
        this.electing = false;
        const newPrimary = this.replicas.find((r) => r.role === "primary" && r.alive);
        this.addLog(
          newPrimary
            ? `${newPrimary.name} elected as new primary.`
            : "No candidates — system degraded.",
          newPrimary ? "healthy" : "danger",
        );
        this.publish();
      }, 1500);
      return;
    }

    this.publish();
  }

  reset(): void {
    this.replicas = this.freshReplicas();
    this.lastCommand = null;
    this.electing = false;
    this.log = [];
    this.logSeq = 0;
    // REAL: bring every replica container back into service.
    if (this.realCluster) this.reviveAll();
    this.publish();
  }

  snapshot(): ReplicationState {
    return {
      mode: this.mode,
      replicas: this.replicas.map((r) => ({ ...r })),
      lastCommand: this.lastCommand,
      electing: this.electing,
      cluster: this.realCluster,
      log: [...this.log],
    };
  }

  // ── Cluster mode internals (§9) ─────────────────────────────────────────────

  /**
   * REAL apply: send a genuine HTTP /work round-trip to the replica container(s).
   * Active → all alive replicas in parallel (ops++ on each real success). Passive →
   * the primary only (ops++), then WAL is shipped to backups — that shipping itself
   * is MODELED in the gateway (we bump each backup's WAL counter), not a real
   * replication protocol. A killed replica's container returns 503, so it genuinely
   * fails to apply.
   */
  private sendCommandReal(command: string): void {
    if (this.mode === "active") {
      const targets = this.replicas.filter((r) => r.alive);
      this.lastCommand = command;
      this.addLog(`"${command}" → real /work on ${targets.length} replica(s)…`, "flow");
      this.publish();
      Promise.all(
        targets.map((r) =>
          callWork(this.endpoints.get(r.id)!).then(({ ok }) => ({ id: r.id, ok })),
        ),
      ).then((results) => {
        let applied = 0;
        for (const { id, ok } of results) {
          const r = this.replicas.find((x) => x.id === id);
          if (!r) continue;
          if (ok) {
            r.ops++;
            applied++;
          } else {
            this.addLog(`${r.name} did not apply (unreachable).`, "danger");
          }
        }
        this.addLog(
          `"${command}" applied on ${applied}/${targets.length} replica(s).`,
          applied > 0 ? "healthy" : "danger",
        );
        this.publish();
      });
      return;
    }

    // Passive: primary applies, then ships WAL to backups (shipping is modeled).
    const primary = this.replicas.find((r) => r.role === "primary" && r.alive);
    if (!primary) {
      this.addLog(`No primary available — command dropped.`, "danger");
      this.publish();
      return;
    }
    this.lastCommand = command;
    this.addLog(`"${command}" → real /work on primary ${primary.name}…`, "flow");
    this.publish();
    callWork(this.endpoints.get(primary.id)!).then(({ ok }) => {
      const p = this.replicas.find((r) => r.id === primary.id);
      if (p && ok) {
        p.ops++;
        p.walEntries++;
        const backups = this.replicas.filter((r) => r.role === "backup" && r.alive);
        for (const b of backups) b.walEntries++;
        this.addLog(
          `"${command}" applied on ${p.name}; WAL shipped to ${backups.length} backup(s) (modeled).`,
          "healthy",
        );
      } else {
        this.addLog(`Primary ${primary.name} unreachable — command dropped.`, "danger");
      }
      this.publish();
    });
  }

  /** Fire-and-forget admin toggle to a real replica container. */
  private pushAdmin(id: string, body: { slow?: boolean; down?: boolean }): void {
    const url = this.endpoints.get(id);
    if (url) void adminWorker(url, body);
  }

  /** Bring every replica container back into service (used by reset / setMode). */
  private reviveAll(): void {
    for (const id of this.endpoints.keys()) this.pushAdmin(id, { down: false });
  }

  private addLog(message: string, tone: TelemetryEntry["tone"] = "muted"): void {
    this.log = [
      ...this.log.slice(-49),
      {
        id: ++this.logSeq,
        time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        message,
        tone,
      },
    ];
  }

  private publish(): void {
    bus.emit("replication", this.snapshot());
  }
}

export const replicationEngine = new ReplicationEngine();
