import "server-only";

import type { Shard, ShardRoute, ShardingState, ShardStrategy, TelemetryEntry } from "@/lib/types";
import { bus } from "./eventBus";

// ── Pure routing functions (exported for vitest) ──────────────────────────────

const SHARDS = ["S0", "S1", "S2", "S3"];

function djb2(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h) ^ key.charCodeAt(i);
    h = h >>> 0; // keep 32-bit unsigned
  }
  return h;
}

export function routeHash(key: string, n: number): { shardIdx: number; rule: string } {
  const h = djb2(key);
  const shardIdx = h % n;
  return { shardIdx, rule: `hash("${key}") = ${h} → ${h} % ${n} = ${shardIdx}` };
}

export function routeRange(key: string, n: number): { shardIdx: number; rule: string } {
  // Range by first char: A-G→0, H-N→1, O-T→2, U-Z / numeric / other→3
  const c = key.charAt(0).toUpperCase();
  let shardIdx: number;
  let range: string;
  if (c >= "A" && c <= "G") { shardIdx = 0; range = "A–G"; }
  else if (c >= "H" && c <= "N") { shardIdx = 1; range = "H–N"; }
  else if (c >= "O" && c <= "T") { shardIdx = 2; range = "O–T"; }
  else { shardIdx = 3; range = "U–Z / other"; }
  shardIdx = Math.min(shardIdx, n - 1);
  return { shardIdx, rule: `"${key}"[0]="${c}" → range ${range} → shard ${shardIdx}` };
}

// Simple static directory: pre-assign known keys; unknown → hash fallback.
const DIRECTORY: Record<string, number> = {
  user: 0, order: 1, product: 2, session: 3,
  account: 0, invoice: 1, catalog: 2, token: 3,
};

export function routeDirectory(key: string, n: number): { shardIdx: number; rule: string } {
  const lower = key.toLowerCase();
  if (lower in DIRECTORY) {
    const shardIdx = Math.min(DIRECTORY[lower], n - 1);
    return { shardIdx, rule: `directory["${lower}"] → shard ${shardIdx}` };
  }
  const fallback = routeHash(key, n);
  return {
    shardIdx: fallback.shardIdx,
    rule: `"${key}" not in directory → hash fallback → shard ${fallback.shardIdx}`,
  };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class ShardingEngine {
  private strategy: ShardStrategy = "hash";
  private shards: Shard[];
  private lastRoute: ShardRoute | null = null;
  private log: TelemetryEntry[] = [];
  private logSeq = 0;

  constructor() {
    this.shards = SHARDS.map((name, i) => ({ id: `s${i}`, name, keys: [] }));
  }

  setStrategy(strategy: ShardStrategy): void {
    this.strategy = strategy;
    this.addLog(`Strategy → ${strategy}.`, "flow");
    this.publish();
  }

  route(key: string): void {
    if (!key.trim()) return;
    const n = this.shards.length;
    let shardIdx: number;
    let rule: string;

    if (this.strategy === "hash") {
      ({ shardIdx, rule } = routeHash(key, n));
    } else if (this.strategy === "range") {
      ({ shardIdx, rule } = routeRange(key, n));
    } else {
      ({ shardIdx, rule } = routeDirectory(key, n));
    }

    const shard = this.shards[shardIdx];
    if (!shard.keys.includes(key)) {
      shard.keys = [...shard.keys.slice(-19), key];
    }
    this.lastRoute = { key, shardId: shard.id, rule };
    this.addLog(`"${key}" → ${shard.name}: ${rule}`, "flow");
    this.publish();
  }

  reset(): void {
    this.shards = SHARDS.map((name, i) => ({ id: `s${i}`, name, keys: [] }));
    this.lastRoute = null;
    this.log = [];
    this.logSeq = 0;
    this.publish();
  }

  snapshot(): ShardingState {
    return {
      strategy: this.strategy,
      shards: this.shards.map((s) => ({ ...s, keys: [...s.keys] })),
      lastRoute: this.lastRoute ? { ...this.lastRoute } : null,
      log: [...this.log],
    };
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
    bus.emit("sharding", this.snapshot());
  }
}

export const shardingEngine = new ShardingEngine();
