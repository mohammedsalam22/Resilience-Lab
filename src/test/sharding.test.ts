import { describe, expect, it } from "vitest";
import { routeHash, routeRange, routeDirectory } from "@/server/engine/sharding";

describe("routeHash", () => {
  it("always returns a shard index in [0, n)", () => {
    for (const key of ["foo", "bar", "baz", "hello", "world", "user123"]) {
      const { shardIdx } = routeHash(key, 4);
      expect(shardIdx).toBeGreaterThanOrEqual(0);
      expect(shardIdx).toBeLessThan(4);
    }
  });

  it("is deterministic — same key always hits same shard", () => {
    const { shardIdx: a } = routeHash("deterministic", 4);
    const { shardIdx: b } = routeHash("deterministic", 4);
    expect(a).toBe(b);
  });

  it("includes the hash computation in the rule string", () => {
    const { rule } = routeHash("test", 4);
    expect(rule).toMatch(/hash/i);
    expect(rule).toMatch(/test/);
  });
});

describe("routeRange", () => {
  it("routes A–G keys to shard 0", () => {
    for (const key of ["apple", "banana", "cherry", "date", "fig", "grape"]) {
      expect(routeRange(key, 4).shardIdx).toBe(0);
    }
  });

  it("routes H–N keys to shard 1", () => {
    for (const key of ["hello", "iris", "jasmine", "kiwi", "lemon", "mango"]) {
      expect(routeRange(key, 4).shardIdx).toBe(1);
    }
  });

  it("routes O–T keys to shard 2", () => {
    for (const key of ["orange", "peach", "quince", "rose", "strawberry"]) {
      expect(routeRange(key, 4).shardIdx).toBe(2);
    }
  });

  it("routes U–Z / other to shard 3", () => {
    for (const key of ["umbrella", "violet", "watermelon", "xerox", "yak", "zebra", "123"]) {
      expect(routeRange(key, 4).shardIdx).toBe(3);
    }
  });
});

describe("routeDirectory", () => {
  it("maps known keys to fixed shards", () => {
    expect(routeDirectory("user", 4).shardIdx).toBe(0);
    expect(routeDirectory("order", 4).shardIdx).toBe(1);
    expect(routeDirectory("product", 4).shardIdx).toBe(2);
    expect(routeDirectory("session", 4).shardIdx).toBe(3);
  });

  it("falls back to hash for unknown keys", () => {
    const { rule } = routeDirectory("unknownxyz", 4);
    expect(rule).toMatch(/hash fallback/i);
  });

  it("is case-insensitive for known keys", () => {
    expect(routeDirectory("USER", 4).shardIdx).toBe(0);
    expect(routeDirectory("Order", 4).shardIdx).toBe(1);
  });
});
