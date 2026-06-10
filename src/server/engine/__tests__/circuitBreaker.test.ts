import { describe, expect, it, vi } from "vitest";
import { CircuitBreakerEngine, cockatielStateToMode } from "../circuitBreaker";
import { CircuitState } from "cockatiel";

// ── Pure helper ───────────────────────────────────────────────────────────────

describe("cockatielStateToMode", () => {
  it("maps Closed -> closed", () => {
    expect(cockatielStateToMode(CircuitState.Closed)).toBe("closed");
  });
  it("maps Open -> open", () => {
    expect(cockatielStateToMode(CircuitState.Open)).toBe("open");
  });
  it("maps HalfOpen -> halfOpen", () => {
    expect(cockatielStateToMode(CircuitState.HalfOpen)).toBe("halfOpen");
  });
  it("maps Isolated -> open", () => {
    expect(cockatielStateToMode(CircuitState.Isolated)).toBe("open");
  });
});

// ── Engine FSM ────────────────────────────────────────────────────────────────

function makeEngine(shouldFail = false) {
  const downstream = vi.fn(async () => {
    if (shouldFail) throw new Error("mock failure");
  });
  const engine = new CircuitBreakerEngine(downstream);
  return { engine, downstream };
}

describe("CircuitBreakerEngine", () => {
  describe("happy path", () => {
    it("starts closed with zero stats", () => {
      const { engine } = makeEngine();
      const s = engine.snapshot();
      expect(s.mode).toBe("closed");
      expect(s.stats).toEqual({ passed: 0, failed: 0, rejected: 0, trips: 0 });
    });

    it("increments passed on a successful request", async () => {
      const { engine } = makeEngine(false);
      await engine.sendRequest();
      expect(engine.snapshot().stats.passed).toBe(1);
    });
  });

  describe("opening the circuit after 3 consecutive failures", () => {
    it("transitions to open after 3 consecutive failures", async () => {
      const { engine } = makeEngine(true);
      await engine.sendRequest();
      await engine.sendRequest();
      await engine.sendRequest();
      expect(engine.snapshot().mode).toBe("open");
      expect(engine.snapshot().stats.trips).toBe(1);
    });

    it("counts failures (not trips) for non-BrokenCircuit errors", async () => {
      const { engine } = makeEngine(true);
      await engine.sendRequest();
      await engine.sendRequest();
      expect(engine.snapshot().stats.failed).toBe(2);
    });
  });

  describe("rejection while open", () => {
    it("counts rejected when circuit is already open", async () => {
      const { engine } = makeEngine(true);
      // Open the breaker with 3 failures
      await engine.sendRequest();
      await engine.sendRequest();
      await engine.sendRequest();
      // Next call must be rejected, not failed
      await engine.sendRequest();
      const s = engine.snapshot();
      expect(s.mode).toBe("open");
      expect(s.stats.rejected).toBeGreaterThanOrEqual(1);
      expect(s.stats.failed).toBe(3);
    });
  });

  describe("toggleService", () => {
    it("flips serviceHealthy on toggle", () => {
      const { engine } = makeEngine();
      expect(engine.snapshot().serviceHealthy).toBe(true);
      engine.toggleService();
      expect(engine.snapshot().serviceHealthy).toBe(false);
      engine.toggleService();
      expect(engine.snapshot().serviceHealthy).toBe(true);
    });
  });

  describe("telemetry log", () => {
    it("appends a log entry after each request", async () => {
      const { engine } = makeEngine(false);
      await engine.sendRequest();
      expect(engine.snapshot().log.length).toBeGreaterThan(0);
    });
  });
});
