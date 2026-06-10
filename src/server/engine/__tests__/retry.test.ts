import { describe, expect, it, vi, afterEach } from "vitest";
import {
  RetryEngine,
  backoffDelay,
  backoffSchedule,
  EXPO_INITIAL_MS,
  FIXED_DELAY_MS,
  EXPO_MAX_MS,
} from "../retry";

// ── Pure backoff schedule ─────────────────────────────────────────────────────

describe("backoffDelay / backoffSchedule", () => {
  it("expo doubles from 1s: 1s, 2s, 4s, 8s", () => {
    expect(backoffSchedule("expo", 4)).toEqual([1000, 2000, 4000, 8000]);
  });

  it("expo first retry equals the initial delay", () => {
    expect(backoffDelay("expo", 1)).toBe(EXPO_INITIAL_MS);
  });

  it("fixed mode is a constant 200ms (no backoff)", () => {
    expect(backoffSchedule("fixed", 4)).toEqual([200, 200, 200, 200]);
    expect(backoffDelay("fixed", 3)).toBe(FIXED_DELAY_MS);
  });

  it("expo is clamped at the max delay", () => {
    // 1000 * 2^99 would overflow far past the cap.
    expect(backoffDelay("expo", 100)).toBe(EXPO_MAX_MS);
  });
});

// ── Engine attempt flow (fake timers so retries don't really wait) ────────────

describe("RetryEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeEngine(downstream: () => Promise<void>) {
    const engine = new RetryEngine(downstream);
    engine.setBackoffMode("fixed"); // keep delays short & deterministic
    return engine;
  }

  it("starts idle with no attempts", () => {
    const engine = makeEngine(async () => {});
    const s = engine.snapshot();
    expect(s.status).toBe("idle");
    expect(s.attempts).toHaveLength(0);
  });

  it("succeeds on first try when downstream is healthy", async () => {
    const engine = makeEngine(async () => {});
    await engine.run();
    const s = engine.snapshot();
    expect(s.status).toBe("succeeded");
    expect(s.attempts).toHaveLength(1);
    expect(s.attempts[0].outcome).toBe("success");
  });

  it("retries up to 5 attempts then fails when always failing", async () => {
    vi.useFakeTimers();
    const downstream = vi.fn(async () => {
      throw new Error("always fails");
    });
    const engine = makeEngine(downstream);

    const runPromise = engine.run();
    // Drain all pending backoff timers.
    await vi.runAllTimersAsync();
    await runPromise;

    const s = engine.snapshot();
    expect(s.status).toBe("failed");
    expect(s.attempts).toHaveLength(5);
    expect(downstream).toHaveBeenCalledTimes(5);
    expect(s.attempts.every((a) => a.outcome === "failure")).toBe(true);
  });

  it("recovers mid-run: fails twice then succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const downstream = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
    });
    const engine = makeEngine(downstream);

    const runPromise = engine.run();
    await vi.runAllTimersAsync();
    await runPromise;

    const s = engine.snapshot();
    expect(s.status).toBe("succeeded");
    expect(s.attempts).toHaveLength(3);
    expect(s.attempts[0].outcome).toBe("failure");
    expect(s.attempts[1].outcome).toBe("failure");
    expect(s.attempts[2].outcome).toBe("success");
  });

  it("ignores config changes while running", async () => {
    const engine = makeEngine(async () => {});
    engine.setBackoffMode("expo");
    expect(engine.snapshot().backoffMode).toBe("expo");
  });

  it("toggleService flips health", () => {
    const engine = makeEngine(async () => {});
    expect(engine.snapshot().serviceHealthy).toBe(true);
    engine.toggleService();
    expect(engine.snapshot().serviceHealthy).toBe(false);
  });
});
