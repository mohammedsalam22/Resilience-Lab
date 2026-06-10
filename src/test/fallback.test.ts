import { describe, expect, it, vi } from "vitest";

// Pure logic: the fallback mode determines which branch runs.
// We test the FallbackEngine stats transitions directly.

// We need to stub the server-only and flakyService imports.
vi.mock("@/server/lib/flakyService", () => ({
  isServiceHealthy: () => true,
  callDownstream: vi.fn().mockResolvedValue(undefined),
}));

import { FallbackEngine } from "@/server/engine/fallback";
import { callDownstream } from "@/server/lib/flakyService";

describe("FallbackEngine", () => {
  it("increments primary stats when primary is healthy", async () => {
    vi.mocked(callDownstream).mockResolvedValueOnce(undefined);
    const engine = new FallbackEngine(true);
    await engine.sendRequest();
    expect(engine.snapshot().stats.primary).toBe(1);
    expect(engine.snapshot().stats.fallback).toBe(0);
  });

  it("increments fallback stats when primary is down (withFallback mode)", async () => {
    vi.mocked(callDownstream).mockResolvedValue(undefined);
    const engine = new FallbackEngine(false);
    engine.setMode("withFallback");
    await engine.sendRequest();
    expect(engine.snapshot().stats.fallback).toBe(1);
    expect(engine.snapshot().stats.failed).toBe(0);
  });

  it("increments failed stats when primary is down (noFallback mode)", async () => {
    vi.mocked(callDownstream).mockResolvedValue(undefined);
    const engine = new FallbackEngine(false);
    engine.setMode("noFallback");
    await engine.sendRequest();
    expect(engine.snapshot().stats.failed).toBe(1);
    expect(engine.snapshot().stats.fallback).toBe(0);
  });

  it("togglePrimary flips health", () => {
    const engine = new FallbackEngine(true);
    engine.togglePrimary();
    expect(engine.snapshot().primaryHealthy).toBe(false);
    engine.togglePrimary();
    expect(engine.snapshot().primaryHealthy).toBe(true);
  });

  it("reset clears stats and heals primary", async () => {
    vi.mocked(callDownstream).mockResolvedValue(undefined);
    const engine = new FallbackEngine(false);
    engine.setMode("noFallback");
    await engine.sendRequest();
    engine.reset();
    const s = engine.snapshot();
    expect(s.stats.primary).toBe(0);
    expect(s.stats.fallback).toBe(0);
    expect(s.stats.failed).toBe(0);
    expect(s.primaryHealthy).toBe(true);
  });
});
