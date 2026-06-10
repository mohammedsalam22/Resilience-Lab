import { describe, expect, it } from "vitest";
import { applyPoll } from "@/server/engine/healthCheck";
import type { HealthNode } from "@/lib/types";

function makeNode(overrides: Partial<HealthNode> = {}): HealthNode {
  return {
    id: "n1",
    name: "Node 1",
    beating: true,
    missed: 0,
    healthy: true,
    inPool: true,
    ...overrides,
  };
}

describe("applyPoll — beating node", () => {
  it("clears missed count and stays healthy", () => {
    const node = makeNode({ beating: true, missed: 1 });
    const { next, event } = applyPoll(node);
    expect(next.missed).toBe(0);
    expect(next.healthy).toBe(true);
    expect(next.inPool).toBe(true);
    expect(event).toBeNull();
  });

  it("emits recovery event when node was previously unhealthy", () => {
    const node = makeNode({ beating: true, missed: 2, healthy: false, inPool: false });
    const { next, event } = applyPoll(node);
    expect(next.healthy).toBe(true);
    expect(next.inPool).toBe(true);
    expect(event).toMatch(/recovered/i);
  });

  it("no event when already healthy", () => {
    const node = makeNode({ beating: true, missed: 0, healthy: true, inPool: true });
    const { event } = applyPoll(node);
    expect(event).toBeNull();
  });
});

describe("applyPoll — silent node", () => {
  it("increments missed on first silence", () => {
    const node = makeNode({ beating: false, missed: 0 });
    const { next, event } = applyPoll(node);
    expect(next.missed).toBe(1);
    expect(next.healthy).toBe(true); // not yet at threshold
    expect(event).toBeNull();
  });

  it("marks unhealthy and removes from pool at threshold (missed=2)", () => {
    const node = makeNode({ beating: false, missed: 1, healthy: true, inPool: true });
    const { next, event } = applyPoll(node);
    expect(next.missed).toBe(2);
    expect(next.healthy).toBe(false);
    expect(next.inPool).toBe(false);
    expect(event).toMatch(/removed from pool/i);
  });

  it("does not emit a second event once already unhealthy", () => {
    const node = makeNode({ beating: false, missed: 2, healthy: false, inPool: false });
    const { next, event } = applyPoll(node);
    expect(next.missed).toBe(3);
    expect(next.healthy).toBe(false);
    expect(event).toBeNull();
  });
});
