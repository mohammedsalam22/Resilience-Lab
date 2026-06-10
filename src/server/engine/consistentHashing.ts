import "server-only";

import type {
  ConsistentHashState,
  RingKey,
  RingNode,
  TelemetryEntry,
  VNode,
} from "@/lib/types";
import { bus } from "./eventBus";

// ── Tuning ────────────────────────────────────────────────────────────────────

export const DEFAULT_REPLICAS = 24; // virtual nodes per physical node
export const MIN_REPLICAS = 1; // 1 = naive consistent hashing (uneven)
export const MAX_REPLICAS = 60;

// ── Pure helpers (exported for vitest) ────────────────────────────────────────

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

/** Map a string to an angle [0, 360). */
export function toAngle(s: string): number {
  return ((djb2(s) % 360) + 360) % 360;
}

/**
 * A physical node is placed at `replicas` points around the ring — its virtual
 * nodes. Spreading every node across many points is what makes the load even and
 * keeps removal cheap; with one point per node the distribution is at the mercy
 * of how the names happen to hash. Each replica's angle is `hash(name#i)`.
 */
export function vnodeAngles(name: string, replicas: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < replicas; i++) out.push(toAngle(`${name}#${i}`));
  return out;
}

/** Flatten all alive nodes' virtual replicas into one ring, sorted clockwise. */
export function buildRing(nodes: RingNode[]): VNode[] {
  const ring: VNode[] = [];
  for (const n of nodes) {
    if (!n.alive) continue;
    for (const angle of n.vnodes) ring.push({ nodeId: n.id, angle });
  }
  return ring.sort((a, b) => a.angle - b.angle);
}

/** The first virtual replica clockwise from keyAngle (wraps past 360 to the first). */
export function findOwner(ring: VNode[], keyAngle: number): VNode | null {
  if (ring.length === 0) return null;
  return ring.find((v) => v.angle >= keyAngle) ?? ring[0];
}

/** Recompute every key's owning node + owning replica angle for the current ring. */
export function recomputeOwners(nodes: RingNode[], keys: RingKey[]): RingKey[] {
  const ring = buildRing(nodes);
  return keys.map((k) => {
    const owner = findOwner(ring, k.angle);
    return {
      ...k,
      ownerId: owner?.nodeId ?? "",
      ownerVnodeAngle: owner?.angle ?? -1,
    };
  });
}

// ── Engine ────────────────────────────────────────────────────────────────────

const NODE_NAMES = ["N0", "N1", "N2", "N3"];
const INITIAL_KEY_LABELS = ["user:1", "user:2", "order:A", "session:X", "cache:Z"];

function makeNode(name: string, replicas: number): RingNode {
  return { id: name.toLowerCase(), name, alive: true, vnodes: vnodeAngles(name, replicas) };
}

function makeKey(label: string, idx: number): RingKey {
  return { id: `k${idx}`, label, angle: toAngle(label), ownerId: "", ownerVnodeAngle: -1 };
}

export class ConsistentHashEngine {
  private nodes: RingNode[];
  private keys: RingKey[];
  private replicas = DEFAULT_REPLICAS;
  private log: TelemetryEntry[] = [];
  private logSeq = 0;
  private nextNodeIdx = NODE_NAMES.length;
  private nextKeyIdx = INITIAL_KEY_LABELS.length;

  constructor() {
    this.nodes = NODE_NAMES.map((n) => makeNode(n, this.replicas));
    this.keys = recomputeOwners(
      this.nodes,
      INITIAL_KEY_LABELS.map((l, i) => makeKey(l, i)),
    );
  }

  addNode(): void {
    const name = `N${this.nextNodeIdx++}`;
    this.nodes = [...this.nodes, makeNode(name, this.replicas)];
    this.remapAndLog(`Node ${name} added (${this.replicas} virtual nodes).`, "healthy");
  }

  removeNode(id: string): void {
    const node = this.nodes.find((n) => n.id === id);
    if (!node || !node.alive) return;
    this.nodes = this.nodes.map((n) => (n.id === id ? { ...n, alive: false } : n));
    this.remapAndLog(`Node ${node.name} removed —`, "warning");
  }

  addKey(label: string): void {
    if (!label.trim()) return;
    const key = makeKey(label, this.nextKeyIdx++);
    const owner = findOwner(buildRing(this.nodes), key.angle);
    key.ownerId = owner?.nodeId ?? "";
    key.ownerVnodeAngle = owner?.angle ?? -1;
    this.keys = [...this.keys, key];
    const ownerNode = this.nodes.find((n) => n.id === key.ownerId);
    this.addLog(
      `Key "${label}" at ${Math.round(key.angle)}° → ${ownerNode?.name ?? "none"}.`,
      "flow",
    );
    this.publish();
  }

  /** Change virtual replicas per node — the headline best-practice control. */
  setReplicas(n: number): void {
    const next = Math.max(MIN_REPLICAS, Math.min(MAX_REPLICAS, Math.round(n)));
    if (next === this.replicas) return;
    this.replicas = next;
    this.nodes = this.nodes.map((node) => ({ ...node, vnodes: vnodeAngles(node.name, next) }));
    this.remapAndLog(
      `Virtual nodes per server → ${next}${next === 1 ? " (naive — watch it clump)" : ""}.`,
      next === 1 ? "danger" : "flow",
    );
  }

  reset(): void {
    this.replicas = DEFAULT_REPLICAS;
    this.nodes = NODE_NAMES.map((n) => makeNode(n, this.replicas));
    this.keys = recomputeOwners(
      this.nodes,
      INITIAL_KEY_LABELS.map((l, i) => makeKey(l, i)),
    );
    this.log = [];
    this.logSeq = 0;
    this.nextNodeIdx = NODE_NAMES.length;
    this.nextKeyIdx = INITIAL_KEY_LABELS.length;
    this.publish();
  }

  snapshot(): ConsistentHashState {
    return {
      nodes: this.nodes.map((n) => ({ ...n, vnodes: [...n.vnodes] })),
      keys: this.keys.map((k) => ({ ...k })),
      replicas: this.replicas,
      log: [...this.log],
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Recompute owners, count how many keys actually moved, log it, publish. */
  private remapAndLog(prefix: string, tone: TelemetryEntry["tone"]): void {
    const before = this.keys.map((k) => k.ownerId);
    this.keys = recomputeOwners(this.nodes, this.keys);
    const moved = this.keys.filter((k, i) => k.ownerId !== before[i] && k.ownerId !== "").length;
    const suffix =
      this.keys.length > 0 ? ` ${moved}/${this.keys.length} key(s) remapped.` : "";
    this.addLog(`${prefix}${suffix}`, tone);
    this.publish();
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
    bus.emit("consistent-hashing", this.snapshot());
  }
}

export const hashRingEngine = new ConsistentHashEngine();
