import "server-only";

import { fallback, handleAll } from "cockatiel";
import type { FallbackMode, FallbackState, FallbackStats, TelemetryEntry } from "@/lib/types";
import { bus } from "./eventBus";
import { isServiceHealthy, callDownstream } from "@/server/lib/flakyService";

// ── Engine ────────────────────────────────────────────────────────────────────

export class FallbackEngine {
  private mode: FallbackMode = "withFallback";
  private primaryHealthy: boolean;
  private stats: FallbackStats = { primary: 0, fallback: 0, failed: 0 };
  private log: TelemetryEntry[] = [];
  private logSeq = 0;

  constructor(initialHealth = true) {
    this.primaryHealthy = initialHealth;
  }

  async sendRequest(): Promise<void> {
    if (this.mode === "withFallback") {
      await this.sendWithFallback();
    } else {
      await this.sendNoFallback();
    }
    this.publish();
  }

  setMode(mode: FallbackMode): void {
    this.mode = mode;
    this.addLog(`Mode → ${mode === "withFallback" ? "with fallback" : "no fallback"}.`, "flow");
    this.publish();
  }

  togglePrimary(): void {
    this.primaryHealthy = !this.primaryHealthy;
    this.addLog(
      this.primaryHealthy ? "Primary service healed." : "Primary service broken.",
      this.primaryHealthy ? "healthy" : "danger",
    );
    this.publish();
  }

  reset(): void {
    this.primaryHealthy = true;
    this.stats = { primary: 0, fallback: 0, failed: 0 };
    this.log = [];
    this.logSeq = 0;
    this.publish();
  }

  getPrimaryHealthy(): boolean {
    return this.primaryHealthy;
  }

  snapshot(): FallbackState {
    return {
      mode: this.mode,
      primaryHealthy: this.primaryHealthy,
      stats: { ...this.stats },
      log: [...this.log],
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async sendWithFallback(): Promise<void> {
    const policy = fallback(handleAll, () => {
      this.stats.fallback++;
      this.addLog("Primary failed → Plan B served cached response.", "warning");
    });

    try {
      await policy.execute(async () => {
        if (!this.primaryHealthy) throw new Error("primary unhealthy");
        await callDownstream();
        this.stats.primary++;
        this.addLog("Primary responded OK.", "healthy");
      });
    } catch {
      // fallback handler already fired above; cockatiel suppresses the throw
      // when the fallback returns a value — but since ours returns void it
      // still resolves. Nothing more to do.
    }
  }

  private async sendNoFallback(): Promise<void> {
    try {
      if (!this.primaryHealthy) throw new Error("primary unhealthy");
      await callDownstream();
      this.stats.primary++;
      this.addLog("Primary responded OK.", "healthy");
    } catch {
      this.stats.failed++;
      this.addLog("Primary failed — no fallback configured.", "danger");
    }
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
    bus.emit("fallback", this.snapshot());
  }
}

export const fallbackEngine = new FallbackEngine(isServiceHealthy());
