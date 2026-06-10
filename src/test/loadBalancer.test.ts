import { describe, expect, it } from "vitest";
import {
  pickAdaptive,
  pickJoinIdleQueue,
  pickLeastConnections,
  pickLeastResponseTime,
  pickPowerOfTwo,
  pickRoundRobin,
  pickWeightedRR,
} from "@/server/engine/loadBalancer";
import type { InFlight, Worker } from "@/lib/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeWorkers(overrides: Partial<Worker>[] = []): Worker[] {
  const defaults: Worker[] = [
    { id: "a", name: "A", weight: 4, slow: false, down: false, handled: 0 },
    { id: "b", name: "B", weight: 2, slow: false, down: false, handled: 0 },
    { id: "c", name: "C", weight: 1, slow: false, down: false, handled: 0 },
    { id: "d", name: "D", weight: 3, slow: false, down: false, handled: 0 },
  ];
  return defaults.map((w, i) => ({ ...w, ...(overrides[i] ?? {}) }));
}

function inFlight(workerId: string, count: number): InFlight[] {
  return Array.from({ length: count }, (_, i) => ({
    workerId,
    doneAt: Date.now() + 1000 + i,
  }));
}

// ── Round-Robin ───────────────────────────────────────────────────────────────

describe("pickRoundRobin", () => {
  it("cycles through all healthy workers", () => {
    const workers = makeWorkers();
    const ids = Array.from({ length: 8 }, (_, i) => pickRoundRobin(workers, i));
    expect(ids).toEqual(["a", "b", "c", "d", "a", "b", "c", "d"]);
  });

  it("skips down workers", () => {
    const workers = makeWorkers([{}, { down: true }, {}, {}]);
    const ids = Array.from({ length: 6 }, (_, i) => pickRoundRobin(workers, i));
    for (const id of ids) expect(id).not.toBe("b");
  });

  it("returns empty string when all workers are down", () => {
    const workers = makeWorkers([
      { down: true },
      { down: true },
      { down: true },
      { down: true },
    ]);
    expect(pickRoundRobin(workers, 0)).toBe("");
  });
});

// ── Weighted Round-Robin ──────────────────────────────────────────────────────

describe("pickWeightedRR", () => {
  it("distributes ~4:2:1:3 over 10 picks (weights 4/2/1/3, total=10)", () => {
    const workers = makeWorkers();
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    // One full cycle is 10 (4+2+1+3)
    for (let i = 0; i < 10; i++) {
      counts[pickWeightedRR(workers, i)]++;
    }
    expect(counts.a).toBe(4);
    expect(counts.b).toBe(2);
    expect(counts.c).toBe(1);
    expect(counts.d).toBe(3);
  });

  it("skips down workers", () => {
    const workers = makeWorkers([{ down: true }, {}, {}, {}]);
    for (let i = 0; i < 20; i++) {
      expect(pickWeightedRR(workers, i)).not.toBe("a");
    }
  });

  it("returns empty string when all workers are down", () => {
    const workers = makeWorkers([
      { down: true },
      { down: true },
      { down: true },
      { down: true },
    ]);
    expect(pickWeightedRR(workers, 0)).toBe("");
  });
});

// ── Least Connections ─────────────────────────────────────────────────────────

describe("pickLeastConnections", () => {
  it("picks the worker with fewest active connections", () => {
    const workers = makeWorkers();
    const flights = [
      ...inFlight("a", 3),
      ...inFlight("b", 1),
      ...inFlight("c", 0),
      ...inFlight("d", 2),
    ];
    expect(pickLeastConnections(workers, flights)).toBe("c");
  });

  it("skips down workers", () => {
    const workers = makeWorkers([{}, {}, { down: true }, {}]);
    const flights = [
      ...inFlight("a", 5),
      ...inFlight("b", 5),
      ...inFlight("c", 0), // down — should be ignored
      ...inFlight("d", 5),
    ];
    // c is down and a/b/d all have 5; should pick one of a/b/d (not c)
    expect(pickLeastConnections(workers, flights)).not.toBe("c");
  });

  it("returns empty string when all workers are down", () => {
    const workers = makeWorkers([
      { down: true },
      { down: true },
      { down: true },
      { down: true },
    ]);
    expect(pickLeastConnections(workers, [])).toBe("");
  });

  it("does not starve later workers when several tie at idle", () => {
    const workers = makeWorkers(); // all idle => all tie at 0 connections
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickLeastConnections(workers, []));
    expect(seen).toEqual(new Set(["a", "b", "c", "d"]));
  });
});

// ── Power of Two Choices ──────────────────────────────────────────────────────

describe("pickPowerOfTwo", () => {
  it("picks the less loaded of the two sampled workers", () => {
    const workers = makeWorkers();
    // Run many picks and ensure the result is always a healthy worker.
    for (let i = 0; i < 50; i++) {
      const id = pickPowerOfTwo(workers, []);
      expect(["a", "b", "c", "d"]).toContain(id);
    }
  });

  it("never picks a down worker", () => {
    const workers = makeWorkers([{ down: true }, {}, {}, {}]);
    for (let i = 0; i < 50; i++) {
      expect(pickPowerOfTwo(workers, [])).not.toBe("a");
    }
  });

  it("returns empty string when all workers are down", () => {
    const workers = makeWorkers([
      { down: true },
      { down: true },
      { down: true },
      { down: true },
    ]);
    expect(pickPowerOfTwo(workers, [])).toBe("");
  });

  it("prefers the worker with fewer connections", () => {
    // Fix workers to just two so we can control the random selection.
    const workers: Worker[] = [
      { id: "x", name: "X", weight: 1, slow: false, down: false, handled: 0 },
      { id: "y", name: "Y", weight: 1, slow: false, down: false, handled: 0 },
    ];
    const flights = inFlight("x", 3); // x has 3, y has 0
    // With only 2 workers, p2c always picks both, so it must return y.
    const result = pickPowerOfTwo(workers, flights);
    expect(result).toBe("y");
  });
});

// Build in-flight entries with explicit remaining times (doneAt = now + remaining).
function flightsWithRemaining(workerId: string, remainings: number[], now: number): InFlight[] {
  return remainings.map((r) => ({ workerId, doneAt: now + r }));
}

// ── Least Response Time ───────────────────────────────────────────────────────

describe("pickLeastResponseTime", () => {
  const NOW = 1_000_000;

  it("picks the worker with the least total remaining time", () => {
    const workers = makeWorkers();
    const flights = [
      ...flightsWithRemaining("a", [500, 500], NOW), // 1000
      ...flightsWithRemaining("b", [800], NOW), //       800
      ...flightsWithRemaining("c", [100], NOW), //       100  (least)
      ...flightsWithRemaining("d", [400, 400], NOW), // 800
    ];
    expect(pickLeastResponseTime(workers, flights, NOW)).toBe("c");
  });

  it("does not starve later workers: ties spread across the whole pool", () => {
    const workers = makeWorkers(); // all idle => all tie at 0
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickLeastResponseTime(workers, [], NOW));
    expect(seen).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("never returns a down worker", () => {
    const workers = makeWorkers([{ down: true }, {}, {}, {}]);
    for (let i = 0; i < 50; i++) {
      expect(pickLeastResponseTime(workers, [], NOW)).not.toBe("a");
    }
  });
});

// ── Join Idle Queue ───────────────────────────────────────────────────────────

describe("pickJoinIdleQueue", () => {
  it("joins an idle worker and never a busy one", () => {
    const workers = makeWorkers();
    const flights = [...inFlight("a", 2), ...inFlight("b", 1)]; // c, d idle
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickJoinIdleQueue(workers, flights));
    expect(seen).toEqual(new Set(["c", "d"])); // both idle workers used, no a/b
  });

  it("does not starve later workers when all are idle", () => {
    const workers = makeWorkers();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickJoinIdleQueue(workers, []));
    expect(seen).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("falls back to least connections when none are idle", () => {
    const workers = makeWorkers();
    const flights = [
      ...inFlight("a", 3),
      ...inFlight("b", 1), // fewest (no idle worker exists)
      ...inFlight("c", 2),
      ...inFlight("d", 4),
    ];
    expect(pickJoinIdleQueue(workers, flights)).toBe("b");
  });

  it("never returns a down worker", () => {
    const workers = makeWorkers([{ down: true }, {}, {}, {}]);
    for (let i = 0; i < 50; i++) {
      expect(pickJoinIdleQueue(workers, [])).not.toBe("a");
    }
  });
});

// ── Adaptive ──────────────────────────────────────────────────────────────────

describe("pickAdaptive", () => {
  it("prefers the worker with the fewest connections", () => {
    const workers = makeWorkers();
    const flights = [...inFlight("a", 3), ...inFlight("c", 2), ...inFlight("d", 1)]; // b idle
    expect(pickAdaptive(workers, flights)).toBe("b");
  });

  it("penalizes slow workers (prefers the fast idle worker)", () => {
    const workers: Worker[] = [
      { id: "x", name: "X", weight: 1, slow: false, down: false, handled: 0 },
      { id: "y", name: "Y", weight: 1, slow: true, down: false, handled: 0 },
    ];
    // Both idle, but y is slow => higher estimated service time => pick x.
    for (let i = 0; i < 50; i++) expect(pickAdaptive(workers, [])).toBe("x");
  });

  it("does not collapse onto one worker: spreads across equal workers", () => {
    const workers = makeWorkers();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickAdaptive(workers, []));
    expect(seen).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("never returns a down worker", () => {
    const workers = makeWorkers([{ down: true }, {}, {}, {}]);
    for (let i = 0; i < 50; i++) {
      expect(pickAdaptive(workers, [])).not.toBe("a");
    }
  });
});
