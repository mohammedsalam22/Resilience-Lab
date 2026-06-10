import "server-only";

import type {
  Algorithm,
  InFlight,
  LBStats,
  LoadBalancerState,
  TelemetryEntry,
  Worker,
} from "@/lib/types";
import { bus } from "./eventBus";
import {
  adminWorker,
  callWork,
  clusterEndpoints,
  isRealCluster,
  probeHealth,
} from "../lib/cluster";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROC_BASE_MS = 1700;
const PROC_SLOW_MS = 5200;
const SPAWN_INTERVAL_MS = 550;
const OVERLOAD_AT = 5;
// Relative cost a "slow" worker adds to its estimated service time (Adaptive).
const SLOW_FACTOR = 3;
// Cluster mode: how often the gateway re-checks each worker's real /health so a
// stopped/restarted container leaves/rejoins the routing pool on its own.
const RECONCILE_MS = 2000;

const INITIAL_WORKERS: Worker[] = [
  { id: "a", name: "A", weight: 4, slow: false, down: false, handled: 0 },
  { id: "b", name: "B", weight: 2, slow: false, down: false, handled: 0 },
  { id: "c", name: "C", weight: 1, slow: false, down: false, handled: 0 },
  { id: "d", name: "D", weight: 3, slow: false, down: false, handled: 0 },
];

// ── Pure pickers (exported for vitest) ───────────────────────────────────────

export function pickRoundRobin(workers: Worker[], counter: number): string {
  const healthy = workers.filter((w) => !w.down);
  if (healthy.length === 0) return "";
  return healthy[counter % healthy.length].id;
}

export function pickWeightedRR(workers: Worker[], counter: number): string {
  const healthy = workers.filter((w) => !w.down);
  if (healthy.length === 0) return "";
  const total = healthy.reduce((sum, w) => sum + w.weight, 0);
  const pos = counter % total;
  let cumulative = 0;
  for (const w of healthy) {
    cumulative += w.weight;
    if (pos < cumulative) return w.id;
  }
  return healthy[healthy.length - 1].id;
}

export function pickLeastConnections(
  workers: Worker[],
  inFlight: InFlight[],
): string {
  const healthy = workers.filter((w) => !w.down);
  if (healthy.length === 0) return "";
  const connections = (id: string) =>
    inFlight.filter((f) => f.workerId === id).length;
  // Fair tie-break so equally-idle workers all get traffic (no first-worker bias).
  return pickMinFair(healthy, (w) => connections(w.id));
}

export function pickPowerOfTwo(
  workers: Worker[],
  inFlight: InFlight[],
): string {
  const healthy = workers.filter((w) => !w.down);
  if (healthy.length === 0) return "";
  if (healthy.length === 1) return healthy[0].id;
  const connections = (id: string) =>
    inFlight.filter((f) => f.workerId === id).length;
  const i = Math.floor(Math.random() * healthy.length);
  let j = Math.floor(Math.random() * (healthy.length - 1));
  if (j >= i) j++;
  const a = healthy[i];
  const b = healthy[j];
  return connections(a.id) <= connections(b.id) ? a.id : b.id;
}

// Tier-2: Sticky RR — same client IP hash always hits the same worker.
export function pickSticky(workers: Worker[], clientKey: number): string {
  const healthy = workers.filter((w) => !w.down);
  if (healthy.length === 0) return "";
  return healthy[clientKey % healthy.length].id;
}

// Pick the worker minimizing `score`, breaking ties UNIFORMLY AT RANDOM among the
// equally-best workers. A plain `reduce` keeps the first element on a tie, which
// starves later workers (D) when several tie at "idle" under low concurrency — so
// every load-based picker funnels ties through here instead.
function pickMinFair(workers: Worker[], score: (w: Worker) => number): string {
  let best = Infinity;
  for (const w of workers) {
    const s = score(w);
    if (s < best) best = s;
  }
  const winners = workers.filter((w) => score(w) === best);
  return winners[Math.floor(Math.random() * winners.length)].id;
}

// Tier-2: Least Response Time — worker with the least total estimated remaining
// processing time across its in-flight requests. Ties (e.g. several idle workers)
// are broken fairly so load spreads across the whole pool.
export function pickLeastResponseTime(
  workers: Worker[],
  inFlight: InFlight[],
  now: number,
): string {
  const healthy = workers.filter((w) => !w.down);
  if (healthy.length === 0) return "";
  const score = (w: Worker) =>
    inFlight
      .filter((f) => f.workerId === w.id)
      .reduce((sum, f) => sum + Math.max(0, f.doneAt - now), 0);
  return pickMinFair(healthy, score);
}

// Tier-2: Join Idle Queue — join a truly idle (0 active) worker, chosen fairly
// among all idle workers; if none are idle, fall back to (fair) least connections.
export function pickJoinIdleQueue(
  workers: Worker[],
  inFlight: InFlight[],
): string {
  const healthy = workers.filter((w) => !w.down);
  if (healthy.length === 0) return "";
  const connections = (id: string) =>
    inFlight.filter((f) => f.workerId === id).length;
  const idle = healthy.filter((w) => connections(w.id) === 0);
  if (idle.length > 0) return idle[Math.floor(Math.random() * idle.length)].id;
  return pickMinFair(healthy, (w) => connections(w.id));
}

// Tier-2: Adaptive — blend load and speed: estimated service time grows with the
// worker's active connections and is higher for "slow" workers. Lowest wins, ties
// broken fairly. (The old formula favored whoever had handled the most, a
// rich-get-richer loop that collapsed all traffic onto one worker.)
export function pickAdaptive(
  workers: Worker[],
  inFlight: InFlight[],
): string {
  const healthy = workers.filter((w) => !w.down);
  if (healthy.length === 0) return "";
  const connections = (id: string) =>
    inFlight.filter((f) => f.workerId === id).length;
  const score = (w: Worker) =>
    (connections(w.id) + 1) * (w.slow ? SLOW_FACTOR : 1);
  return pickMinFair(healthy, score);
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class LoadBalancerEngine {
  private workers: Worker[];
  private inFlight: InFlight[] = [];
  private algorithm: Algorithm = "rr";
  private streaming = false;
  private stats: LBStats = { routed: 0, dropped: 0 };
  private log: TelemetryEntry[] = [];
  private logSeq = 0;
  private rrCounter = 0;
  private stickyKey = 0;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private spawnAccumulator = 0;
  private lastTick = Date.now();

  // ── Cluster mode (§9) — set once from the env flag ──────────────────────────
  private readonly realCluster = isRealCluster();
  private readonly endpoints = new Map<string, string>(); // workerId → base URL
  private reconcileInterval: ReturnType<typeof setInterval> | null = null;
  private inflightSeq = 0;

  constructor() {
    const eps = this.realCluster ? clusterEndpoints() : [];
    if (this.realCluster && eps.length > 0) {
      // REAL workers: identity/weight come from the worker containers (§9).
      this.workers = eps.map((e) => ({
        id: e.id,
        name: e.name,
        weight: e.weight,
        slow: false,
        down: false,
        handled: 0,
      }));
      for (const e of eps) this.endpoints.set(e.id, e.url);
    } else {
      // MODELED workers: in-process objects (default).
      this.workers = INITIAL_WORKERS.map((w) => ({ ...w }));
    }
    this.startTick();
    if (this.realCluster && this.endpoints.size > 0) this.startReconcile();
  }

  // ── Public intents ──────────────────────────────────────────────────────────

  setAlgorithm(algo: Algorithm): void {
    this.algorithm = algo;
    this.rrCounter = 0;
    this.addLog(`Algorithm → ${algo.toUpperCase()}.`, "flow");
    this.publish();
  }

  sendRequest(): void {
    this.route();
    this.publish();
  }

  toggleSlow(id: string): void {
    const w = this.workers.find((w) => w.id === id);
    if (!w) return;
    w.slow = !w.slow;
    this.addLog(
      `Worker ${w.name} marked ${w.slow ? "slow" : "normal"}.`,
      w.slow ? "warning" : "muted",
    );
    // REAL: tell the container to actually slow its /work endpoint.
    if (this.realCluster) this.pushAdmin(w.id, { slow: w.slow });
    this.publish();
  }

  toggleDown(id: string): void {
    const w = this.workers.find((w) => w.id === id);
    if (!w) return;
    w.down = !w.down;
    if (w.down) {
      this.inFlight = this.inFlight.filter((f) => f.workerId !== id);
    }
    this.addLog(
      `Worker ${w.name} ${w.down ? "taken down" : "brought back up"}.`,
      w.down ? "danger" : "healthy",
    );
    // REAL: take the container out of service for real (/work + /health 503).
    if (this.realCluster) this.pushAdmin(w.id, { down: w.down });
    this.publish();
  }

  toggleStream(): void {
    this.streaming = !this.streaming;
    this.spawnAccumulator = 0;
    this.lastTick = Date.now();
    this.addLog(
      this.streaming ? "Streaming started." : "Streaming stopped.",
      this.streaming ? "flow" : "muted",
    );
    this.publish();
  }

  reset(): void {
    this.stopTick();
    if (this.realCluster && this.endpoints.size > 0) {
      // Re-seed from the real workers and bring every container back into service.
      this.workers = [...this.endpoints.keys()].map((id) => {
        const prev = this.workers.find((w) => w.id === id)!;
        return { ...prev, slow: false, down: false, handled: 0 };
      });
      for (const id of this.endpoints.keys()) this.pushAdmin(id, { slow: false, down: false });
    } else {
      this.workers = INITIAL_WORKERS.map((w) => ({ ...w }));
    }
    this.inFlight = [];
    this.algorithm = "rr";
    this.streaming = false;
    this.stats = { routed: 0, dropped: 0 };
    this.log = [];
    this.logSeq = 0;
    this.rrCounter = 0;
    this.stickyKey = 0;
    this.spawnAccumulator = 0;
    this.lastTick = Date.now();
    this.startTick();
    this.publish();
  }

  snapshot(): LoadBalancerState {
    return {
      workers: this.workers.map((w) => ({ ...w })),
      inFlight: [...this.inFlight],
      algorithm: this.algorithm,
      streaming: this.streaming,
      stats: { ...this.stats },
      cluster: this.realCluster,
      log: [...this.log],
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private route(): void {
    const id = this.pick();
    if (!id) {
      this.stats.dropped++;
      this.addLog("No healthy workers — request dropped.", "danger");
      return;
    }
    const w = this.workers.find((w) => w.id === id)!;
    const active = this.inFlight.filter((f) => f.workerId === id).length;
    if (active >= OVERLOAD_AT) {
      this.stats.dropped++;
      this.addLog(
        `Worker ${w.name} overloaded (${active} active) — dropped.`,
        "danger",
      );
      return;
    }
    if (this.realCluster) {
      this.dispatchReal(w);
      return;
    }

    const duration = w.slow ? PROC_SLOW_MS : PROC_BASE_MS;
    this.inFlight = [...this.inFlight, { workerId: id, doneAt: Date.now() + duration }];
    w.handled++;
    this.stats.routed++;
    this.rrCounter++;
    this.addLog(`→ Worker ${w.name} (${this.algorithm.toUpperCase()}).`, "flow");
  }

  // ── Cluster mode internals (§9) ─────────────────────────────────────────────

  /**
   * REAL routing: occupy a worker slot, fire a genuine HTTP GET /work to the
   * container, and free the slot when it actually responds. The slot is held
   * (doneAt = +∞) until completion, so real latency — including a worker put in
   * "slow" mode — is reflected live, and a stopped container surfaces as a
   * failure. The routing decision (`pick`) is shared with in-process mode.
   */
  private dispatchReal(w: Worker): void {
    const url = this.endpoints.get(w.id);
    if (!url) {
      this.stats.dropped++;
      this.addLog(`No endpoint for worker ${w.name} — dropped.`, "danger");
      return;
    }
    const flightId = ++this.inflightSeq;
    // Estimated finish time so Least-Response-Time can rank workers (and penalize
    // slow ones). The slot is only actually freed when the REAL /work returns —
    // the tick never auto-completes a real (id-tagged) in-flight entry.
    const est = w.slow ? PROC_SLOW_MS : PROC_BASE_MS;
    this.inFlight = [
      ...this.inFlight,
      { id: flightId, workerId: w.id, doneAt: Date.now() + est },
    ];
    this.stats.routed++; // the balancer dispatched it (matches in-process semantics)
    this.rrCounter++;
    this.addLog(`→ Worker ${w.name} (${this.algorithm.toUpperCase()}) — real GET /work.`, "flow");

    callWork(url).then(({ ok, ms }) => {
      this.inFlight = this.inFlight.filter((f) => f.id !== flightId);
      const cur = this.workers.find((x) => x.id === w.id);
      if (ok) {
        if (cur) cur.handled++; // "done" = a real completed round-trip
        this.addLog(`✓ ${w.name} responded in ${ms}ms.`, "healthy");
      } else {
        // The container failed mid-flight (e.g. stopped). Drop it from the pool;
        // the /health reconcile loop restores it if/when it comes back.
        if (cur && !cur.down) {
          cur.down = true;
          this.inFlight = this.inFlight.filter((f) => f.workerId !== cur.id);
        }
        this.addLog(`✗ ${w.name} /work failed (${ms}ms) — removed from pool.`, "danger");
      }
      this.publish();
    });
  }

  /** Fire-and-forget admin toggle to a real worker container. */
  private pushAdmin(id: string, body: { slow?: boolean; down?: boolean }): void {
    const url = this.endpoints.get(id);
    if (!url) return;
    adminWorker(url, body).then((ok) => {
      if (!ok) {
        const w = this.workers.find((x) => x.id === id);
        this.addLog(`⚠ /admin to ${w?.name ?? id} did not apply.`, "warning");
        this.publish();
      }
    });
  }

  /**
   * Periodically probe each worker's real /health so a container that is stopped
   * (or restarted) leaves (or rejoins) the routing pool on its own — no request
   * needs to be sent to discover it.
   */
  private startReconcile(): void {
    if (this.reconcileInterval !== null) return;
    const run = () => {
      for (const w of this.workers) {
        const url = this.endpoints.get(w.id);
        if (!url) continue;
        probeHealth(url).then((alive) => {
          const cur = this.workers.find((x) => x.id === w.id);
          if (!cur) return;
          if (!alive && !cur.down) {
            cur.down = true;
            this.inFlight = this.inFlight.filter((f) => f.workerId !== cur.id);
            this.addLog(`Worker ${cur.name} unreachable — removed from pool.`, "danger");
            this.publish();
          } else if (alive && cur.down) {
            cur.down = false;
            this.addLog(`Worker ${cur.name} reachable again — back in pool.`, "healthy");
            this.publish();
          }
        });
      }
    };
    this.reconcileInterval = setInterval(run, RECONCILE_MS);
    run();
  }

  private pick(): string {
    switch (this.algorithm) {
      case "rr":
        return pickRoundRobin(this.workers, this.rrCounter);
      case "wrr":
        return pickWeightedRR(this.workers, this.rrCounter);
      case "lc":
        return pickLeastConnections(this.workers, this.inFlight);
      case "p2c":
        return pickPowerOfTwo(this.workers, this.inFlight);
      case "sticky":
        return pickSticky(this.workers, this.stickyKey++);
      case "lrt":
        return pickLeastResponseTime(this.workers, this.inFlight, Date.now());
      case "jiq":
        return pickJoinIdleQueue(this.workers, this.inFlight);
      case "adaptive":
        return pickAdaptive(this.workers, this.inFlight);
    }
  }

  private tick(): void {
    const now = Date.now();
    const elapsed = now - this.lastTick;
    this.lastTick = now;

    // Complete finished in-flight requests. In-process entries complete by their
    // timer; real (cluster) entries carry an `id` and are removed only when their
    // actual /work response lands — so the estimated doneAt never drops them early.
    const before = this.inFlight.length;
    this.inFlight = this.inFlight.filter((f) => f.id !== undefined || f.doneAt > now);
    const completed = before - this.inFlight.length;
    if (completed > 0) this.publish();

    // Spawn new requests when streaming.
    if (this.streaming) {
      this.spawnAccumulator += elapsed;
      let spawned = false;
      while (this.spawnAccumulator >= SPAWN_INTERVAL_MS) {
        this.spawnAccumulator -= SPAWN_INTERVAL_MS;
        this.route();
        spawned = true;
      }
      if (spawned) this.publish();
    }
  }

  private startTick(): void {
    this.tickInterval = setInterval(() => this.tick(), 100);
  }

  private stopTick(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
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
    bus.emit("load-balancer", this.snapshot());
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────

export const lbEngine = new LoadBalancerEngine();
