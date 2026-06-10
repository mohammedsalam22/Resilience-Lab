import "server-only";

import {
  ConstantBackoff,
  ExponentialBackoff,
  handleAll,
  noJitterGenerator,
  fullJitterGenerator,
  retry,
} from "cockatiel";
import type {
  BackoffMode,
  RetryAttempt,
  RetryState,
  TelemetryEntry,
} from "@/lib/types";
import { bus } from "./eventBus";

// ── Tuning ────────────────────────────────────────────────────────────────────

export const MAX_ATTEMPTS = 5; // 1 initial + up to 4 retries
export const EXPO_INITIAL_MS = 1_000; // 1s, 2s, 4s, 8s…
export const FIXED_DELAY_MS = 200; // "no backoff" contrast mode
export const EXPO_MAX_MS = 30_000;

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * The delay (ms) the engine waits BEFORE retry number `attempt` (1-based),
 * with jitter off. Mirrors cockatiel's noJitterGenerator: initialDelay * 2^n.
 *   expo: 1000, 2000, 4000, 8000 …   fixed: 200, 200, 200 …
 */
export function backoffDelay(mode: BackoffMode, attempt: number): number {
  if (mode === "fixed") return FIXED_DELAY_MS;
  return Math.min(EXPO_INITIAL_MS * 2 ** (attempt - 1), EXPO_MAX_MS);
}

/** The full schedule of delays for retries 1..count (jitter off). */
export function backoffSchedule(mode: BackoffMode, count: number): number[] {
  return Array.from({ length: count }, (_, i) => backoffDelay(mode, i + 1));
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class RetryEngine {
  private backoffMode: BackoffMode = "expo";
  private jitter = false;
  private serviceHealthy: boolean;
  private status: RetryState["status"] = "idle";
  private waitingSince: number | null = null;
  private currentDelay: number | null = null;
  private attempts: RetryAttempt[] = [];
  private log: TelemetryEntry[] = [];
  private logSeq = 0;
  private running = false;

  constructor(
    private readonly downstream: () => Promise<void>,
    initialHealth = true,
  ) {
    this.serviceHealthy = initialHealth;
  }

  private buildPolicy() {
    const backoff =
      this.backoffMode === "fixed"
        ? new ConstantBackoff(FIXED_DELAY_MS)
        : new ExponentialBackoff({
            initialDelay: EXPO_INITIAL_MS,
            maxDelay: EXPO_MAX_MS,
            exponent: 2,
            generator: this.jitter ? fullJitterGenerator : noJitterGenerator,
          });

    const policy = retry(handleAll, { maxAttempts: MAX_ATTEMPTS - 1, backoff });

    policy.onRetry((info) => {
      // The just-finished attempt failed; we're about to wait `info.delay`.
      const justFinished = this.attempts[this.attempts.length - 1];
      if (justFinished) {
        justFinished.outcome = "failure";
        justFinished.delayBeforeNext = info.delay;
      }
      this.waitingSince = Date.now();
      this.currentDelay = info.delay;
      this.addLog(
        `Attempt ${justFinished?.attempt ?? "?"} failed — retrying in ${Math.round(info.delay)}ms.`,
        "warning",
      );
      // Queue the next attempt row as pending.
      this.pushAttempt();
      this.publish();
    });

    return policy;
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.attempts = [];
    this.status = "running";
    this.waitingSince = null;
    this.currentDelay = null;
    this.addLog(
      `Run started — ${this.backoffMode === "fixed" ? "fixed 200ms" : "exponential"} backoff${this.jitter ? " + jitter" : ""}.`,
      "flow",
    );
    this.pushAttempt(); // attempt 1, pending
    this.publish();

    const policy = this.buildPolicy();

    try {
      await policy.execute(() => this.downstream());
      const last = this.attempts[this.attempts.length - 1];
      if (last) {
        last.outcome = "success";
        last.delayBeforeNext = null;
      }
      this.status = "succeeded";
      this.waitingSince = null;
      this.currentDelay = null;
      this.addLog(`Attempt ${last?.attempt ?? "?"} succeeded.`, "healthy");
    } catch {
      const last = this.attempts[this.attempts.length - 1];
      if (last) {
        last.outcome = "failure";
        last.delayBeforeNext = null;
      }
      this.status = "failed";
      this.waitingSince = null;
      this.currentDelay = null;
      this.addLog(`Gave up after ${this.attempts.length} attempts.`, "danger");
    } finally {
      this.running = false;
      this.publish();
    }
  }

  setBackoffMode(mode: BackoffMode): void {
    if (this.running) return;
    this.backoffMode = mode;
    this.publish();
  }

  setJitter(jitter: boolean): void {
    if (this.running) return;
    this.jitter = jitter;
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
    if (this.running) return;
    this.status = "idle";
    this.attempts = [];
    this.waitingSince = null;
    this.currentDelay = null;
    this.log = [];
    this.logSeq = 0;
    this.publish();
  }

  getServiceHealthy(): boolean {
    return this.serviceHealthy;
  }

  snapshot(): RetryState {
    return {
      backoffMode: this.backoffMode,
      jitter: this.jitter,
      serviceHealthy: this.serviceHealthy,
      status: this.status,
      waitingSince: this.waitingSince,
      currentDelay: this.currentDelay,
      attempts: this.attempts.map((a) => ({ ...a })),
      log: [...this.log],
    };
  }

  private pushAttempt(): void {
    this.attempts.push({
      attempt: this.attempts.length + 1,
      outcome: "pending",
      delayBeforeNext: null,
    });
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
    bus.emit("retry", this.snapshot());
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────

import { callDownstream, isServiceHealthy } from "@/server/lib/flakyService";

function makeDownstream() {
  return async () => {
    if (!isServiceHealthy()) throw new Error("service unhealthy");
    await callDownstream();
  };
}

export const retryEngine = new RetryEngine(makeDownstream());
