import { describe, expect, it } from "vitest";
import {
  toAngle,
  vnodeAngles,
  buildRing,
  findOwner,
  recomputeOwners,
} from "@/server/engine/consistentHashing";
import type { RingKey, RingNode } from "@/lib/types";

function node(name: string, replicas: number): RingNode {
  return { id: name.toLowerCase(), name, alive: true, vnodes: vnodeAngles(name, replicas) };
}

function key(label: string): RingKey {
  return { id: label, label, angle: toAngle(label), ownerId: "", ownerVnodeAngle: -1 };
}

describe("toAngle", () => {
  it("always returns a value in [0, 360)", () => {
    for (const s of ["user:1", "N0", "N1", "abc", "xyz", "123"]) {
      const a = toAngle(s);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    }
  });

  it("is deterministic", () => {
    expect(toAngle("user:1")).toBe(toAngle("user:1"));
  });
});

describe("vnodeAngles", () => {
  it("produces exactly `replicas` points, all in range", () => {
    const angles = vnodeAngles("N0", 24);
    expect(angles).toHaveLength(24);
    for (const a of angles) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    }
  });
});

describe("findOwner (on a virtual-node ring)", () => {
  const ring = buildRing([
    { id: "a", name: "A", alive: true, vnodes: [90] },
    { id: "b", name: "B", alive: true, vnodes: [180] },
    { id: "c", name: "C", alive: true, vnodes: [270] },
  ]);

  it("returns the first clockwise replica", () => {
    expect(findOwner(ring, 45)?.nodeId).toBe("a");
    expect(findOwner(ring, 100)?.nodeId).toBe("b");
    expect(findOwner(ring, 200)?.nodeId).toBe("c");
  });

  it("wraps around past the last replica to the first", () => {
    expect(findOwner(ring, 300)?.nodeId).toBe("a");
  });

  it("returns null on an empty ring", () => {
    expect(findOwner([], 100)).toBeNull();
  });
});

describe("buildRing", () => {
  it("excludes dead nodes' replicas", () => {
    const ring = buildRing([
      { id: "a", name: "A", alive: false, vnodes: [10, 20] },
      { id: "b", name: "B", alive: true, vnodes: [30] },
    ]);
    expect(ring.every((v) => v.nodeId === "b")).toBe(true);
  });
});

describe("virtual nodes: distribution + minimal remapping", () => {
  const labels = Array.from({ length: 60 }, (_, i) => `key:${i}`);

  it("spread is far more even with many replicas than with one", () => {
    const spread = (replicas: number) => {
      const nodes = ["N0", "N1", "N2", "N3"].map((n) => node(n, replicas));
      const keys = recomputeOwners(nodes, labels.map(key));
      const counts = nodes.map((n) => keys.filter((k) => k.ownerId === n.id).length);
      return Math.max(...counts) - Math.min(...counts); // imbalance (0 = perfect)
    };
    // More replicas => smaller gap between busiest and idlest node.
    expect(spread(24)).toBeLessThan(spread(1));
  });

  it("removing a node only remaps keys it owned, never the rest", () => {
    const nodes = ["N0", "N1", "N2", "N3"].map((n) => node(n, 24));
    const keys = recomputeOwners(nodes, labels.map(key));
    const target = nodes[1]; // remove N1
    const ownedByTarget = keys.filter((k) => k.ownerId === target.id).length;

    const after = recomputeOwners(
      nodes.map((n) => (n.id === target.id ? { ...n, alive: false } : n)),
      keys,
    );
    const moved = after.filter((k, i) => k.ownerId !== keys[i].ownerId).length;

    // Exactly the target's keys move; everyone else stays put.
    expect(moved).toBe(ownedByTarget);
    for (const k of after) {
      const before = keys.find((b) => b.id === k.id)!;
      if (before.ownerId !== target.id) expect(k.ownerId).toBe(before.ownerId);
    }
  });
});
