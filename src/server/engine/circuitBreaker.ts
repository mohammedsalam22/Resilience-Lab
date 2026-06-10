import "server-only";

import {
  CircuitState,
  ConsecutiveBreaker,
  circuitBreaker,
  handleAll,
  isBrokenCircuitError,
} from "cockatiel";
import type { BreakerMode, BreakerState, TelemetryEntry } from "@/lib/types";
import { bus } from "./eventBus";

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

export function cockatielStateToMode(state: CircuitState): BreakerMode {
  switch (state) {
    case CircuitState.Open:
    case CircuitState.Isolated:
      return "open";
    case CircuitState.HalfOpen:
      return "halfOpen";
    default:
      return "closed";
  }
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class CircuitBreakerEngine {
  private readonly breaker;
  private mode: BreakerMode = "closed";
  private stats = { passed: 0, failed: 0, rejected: 0, trips: 0 };
  private serviceHealthy: boolean;
  private openedAt: number | null = null;
  private log: TelemetryEntry[] = [];
  private logSeq = 0;

  constructor(
    private readonly downstream: () => Promise<void>,
    initialHealth = true,
  ) {
    this.serviceHealthy = initialHealth;

    this.breaker = circuitBreaker(handleAll, {
      halfOpenAfter: 5_000,
      breaker: new ConsecutiveBreaker(3),
    });

    this.breaker.onBreak(() => {
      this.stats.trips++;
      this.mode = "open";
      this.openedAt = Date.now();
      this.addLog("Circuit opened — requests will be rejected fast.", "danger");
      this.publish();
    });

    this.breaker.onHalfOpen(() => {
      this.mode = "halfOpen";
      this.addLog("Half-open — probing downstream…", "warning");
      this.publish();
    });

    this.breaker.onReset(() => {
      this.mode = "closed";
      this.openedAt = null;
      this.addLog("Circuit closed — service recovered.", "healthy");
      this.publish();
    });
  }

  async sendRequest(): Promise<void> {
    try {
      await this.breaker.execute(() => this.downstream());
      this.stats.passed++;
      this.addLog("Request passed → downstream OK.", "healthy");
    } catch (err) {
      if (isBrokenCircuitError(err)) {
        this.stats.rejected++;
        this.addLog("Request rejected — circuit is open.", "danger");
      } else {
        this.stats.failed++;
        this.addLog(
          `Request failed — downstream error (${this.stats.failed} consecutive).`,
          "warning",
        );
      }
    }
    this.publish();
  }

  toggleService(): void {
    this.serviceHealthy = !this.serviceHealthy;
    this.addLog(
      this.serviceHealthy ? "Service healed." : "Service broken.",
      this.serviceHealthy ? "healthy" : "danger",
    );
    this.publish();
  }

  reset(): void {
    this.stats = { passed: 0, failed: 0, rejected: 0, trips: 0 };
    this.mode = "closed";
    this.openedAt = null;
    this.log = [];
    this.logSeq = 0;
    // Recreate the breaker policy — there is no public reset() in cockatiel.
    // The old instance is simply discarded; the new one starts fresh closed.
    Object.assign(this, new CircuitBreakerEngine(this.downstream, this.serviceHealthy));
    this.publish();
  }

  getServiceHealthy(): boolean {
    return this.serviceHealthy;
  }

  snapshot(): BreakerState {
    return {
      mode: this.mode,
      stats: { ...this.stats },
      serviceHealthy: this.serviceHealthy,
      openedAt: this.openedAt,
      log: [...this.log],
    };
  }

  private addLog(
    message: string,
    tone: TelemetryEntry["tone"] = "muted",
  ): void {
    const entry: TelemetryEntry = {
      id: ++this.logSeq,
      time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      message,
      tone,
    };
    this.log = [...this.log.slice(-49), entry];
  }

  private publish(): void {
    bus.emit("circuit-breaker", this.snapshot());
  }
}

// ── Module-level singleton (persists across requests on the Node server) ──────

import { callDownstream, isServiceHealthy } from "@/server/lib/flakyService";

function makeDownstream() {
  return async () => {
    // flakyService toggle controls health; callDownstream() reads it via the
    // real /api/downstream endpoint so the round-trip is genuinely REAL.
    if (!isServiceHealthy()) throw new Error("service unhealthy");
    await callDownstream();
  };
}

export const breakerEngine = new CircuitBreakerEngine(makeDownstream());
