"use client";

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PlusCircle, RefreshCw } from "lucide-react";
import type { ConsistentHashState, RingKey, RingNode } from "@/lib/types";
import { useEventStream } from "@/hooks/useEventStream";
import { SoftCard } from "@/components/ui/SoftCard";
import { TelemetryLog } from "@/components/ui/TelemetryLog";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

// ── Constants ─────────────────────────────────────────────────────────────────

const RING_R = 120; // ring circle radius (px)
const KEY_RING_R = RING_R - 26; // keys sit just inside the ring
const VNODE_R = 2.6; // virtual-node tick radius (px)
const KEY_R = 4.5; // key dot radius (px)
const SVG_SIZE = (RING_R + 18) * 2;
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;
const MAX_NODES = 6; // matches the node-identity palette below

// Node identity colors — defined as theme tokens in globals.css (never hardcoded).
const NODE_VARS = [
  "var(--node-0)",
  "var(--node-1)",
  "var(--node-2)",
  "var(--node-3)",
  "var(--node-4)",
  "var(--node-5)",
];

function angleToXY(deg: number, r: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

const INITIAL_STATE: ConsistentHashState = {
  nodes: [],
  keys: [],
  replicas: 24,
  log: [],
};

const PRESET_KEYS = ["user:3", "order:B", "product:99", "token:abc"];

async function postIntent(body: Record<string, unknown>) {
  await fetch("/api/consistent-hashing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function colorFor(nodes: RingNode[], id: string): string {
  const i = nodes.findIndex((n) => n.id === id);
  return NODE_VARS[((i % NODE_VARS.length) + NODE_VARS.length) % NODE_VARS.length];
}

// ── Ring diagram ──────────────────────────────────────────────────────────────

function RingDiagram({ nodes, keys }: { nodes: RingNode[]; keys: RingKey[] }) {
  const reduced = useReducedMotion();
  const alive = nodes.filter((n) => n.alive);

  return (
    <svg
      width={SVG_SIZE}
      height={SVG_SIZE}
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      className="mx-auto max-w-full"
      aria-label="Consistent hash ring with virtual nodes"
    >
      <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="var(--border)" strokeWidth={1.5} />

      {/* Virtual-node ticks — every replica of every alive node, colored by node. */}
      {alive.map((n) =>
        n.vnodes.map((a, i) => {
          const p = angleToXY(a, RING_R);
          return (
            <circle
              key={`${n.id}-${i}`}
              cx={p.x}
              cy={p.y}
              r={VNODE_R}
              fill={colorFor(nodes, n.id)}
              opacity={0.85}
            />
          );
        }),
      )}

      {/* Each key → a thin arc to the exact replica that owns it. */}
      {keys.map((k) => {
        if (k.ownerVnodeAngle < 0) return null;
        const kp = angleToXY(k.angle, KEY_RING_R);
        const op = angleToXY(k.ownerVnodeAngle, RING_R);
        return (
          <line
            key={`arc-${k.id}`}
            x1={kp.x}
            y1={kp.y}
            x2={op.x}
            y2={op.y}
            stroke={colorFor(nodes, k.ownerId)}
            strokeWidth={1}
            strokeOpacity={0.5}
          />
        );
      })}

      {/* Key dots. */}
      {keys.map((k) => {
        const p = angleToXY(k.angle, KEY_RING_R);
        return (
          <motion.g
            key={k.id}
            initial={reduced ? false : { opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
          >
            <circle cx={p.x} cy={p.y} r={KEY_R} fill="var(--text)" />
            <text x={p.x} y={p.y - KEY_R - 3} textAnchor="middle" fontSize={7.5} fill="var(--muted)">
              {k.label.length > 9 ? k.label.slice(0, 8) + "…" : k.label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

// ── Distribution bars (how evenly keys land) ──────────────────────────────────

function Distribution({ nodes, keys }: { nodes: RingNode[]; keys: RingKey[] }) {
  const alive = nodes.filter((n) => n.alive);
  if (alive.length === 0 || keys.length === 0) return null;
  const counts = alive.map((n) => ({
    node: n,
    count: keys.filter((k) => k.ownerId === n.id).length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.count));

  return (
    <SoftCard className="flex flex-col gap-2 p-4">
      <p className="text-xs font-medium text-muted">Key distribution per server</p>
      {counts.map(({ node, count }) => (
        <div key={node.id} className="flex items-center gap-2">
          <span className="w-8 font-mono text-xs text-muted">{node.name}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${(count / max) * 100}%`, background: colorFor(nodes, node.id) }}
            />
          </div>
          <span className="w-6 text-right font-mono text-xs text-text">{count}</span>
        </div>
      ))}
    </SoftCard>
  );
}

// ── Key ownership table ───────────────────────────────────────────────────────

function OwnershipTable({ nodes, keys }: { nodes: RingNode[]; keys: RingKey[] }) {
  if (keys.length === 0) return null;
  return (
    <SoftCard className="overflow-hidden p-0">
      <table className="w-full text-xs">
        <caption className="sr-only">Key ownership: each key, its angle, and the owning server.</caption>
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-2 text-left font-medium text-muted">Key</th>
            <th className="px-4 py-2 text-left font-medium text-muted">Angle</th>
            <th className="px-4 py-2 text-left font-medium text-muted">Owner</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const owner = nodes.find((n) => n.id === k.ownerId);
            return (
              <tr key={k.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-mono text-text">{k.label}</td>
                <td className="px-4 py-2 font-mono text-muted">{Math.round(k.angle)}°</td>
                <td className="px-4 py-2 font-mono">
                  {owner ? (
                    <span className="inline-flex items-center gap-1.5" style={{ color: colorFor(nodes, owner.id) }}>
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: colorFor(nodes, owner.id) }}
                      />
                      {owner.name}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SoftCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ConsistentHashing() {
  const state = useEventStream<ConsistentHashState>(
    "/api/consistent-hashing/stream",
    INITIAL_STATE,
  );
  const [keyInput, setKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Local override so the replica slider feels instant; server stays the source of truth.
  const [replicasLocal, setReplicasLocal] = useState<number | null>(null);

  const fire = useCallback(async (body: Record<string, unknown>) => {
    setLoading(true);
    await postIntent(body);
    setLoading(false);
  }, []);

  const addKey = useCallback(
    async (label: string) => {
      const l = label.trim();
      if (!l) return;
      await fire({ type: "addKey", label: l });
      setKeyInput("");
    },
    [fire],
  );

  const { nodes, keys, log, replicas: serverReplicas } = state;
  const aliveNodes = nodes.filter((n) => n.alive);

  // Follow the server whenever it changes (commit echo, reset, other clients);
  // the local override only holds mid-drag. Adjusting state during render is the
  // React-sanctioned alternative to a setState-in-effect.
  const [prevServerReplicas, setPrevServerReplicas] = useState(serverReplicas);
  if (serverReplicas !== prevServerReplicas) {
    setPrevServerReplicas(serverReplicas);
    setReplicasLocal(null);
  }
  const replicas = replicasLocal ?? serverReplicas;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Consistent Hashing</h1>
          <p className="mt-1 text-sm text-muted">
            Each server is scattered to many <strong>virtual nodes</strong> around a ring; a key is
            owned by the first replica clockwise. Drag the slider to 1 to see naive hashing clump,
            then raise it to watch the load even out — and removing a server only remaps its keys.
          </p>
        </div>
        <RealModeledBadge kind="MODELED" />
      </div>

      {/* Ring + replica slider */}
      <SoftCard className="flex flex-col items-center gap-5 p-6">
        <RingDiagram nodes={nodes} keys={keys} />

        <div className="flex w-full max-w-sm flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="replicas" className="font-medium text-muted">
              Virtual nodes per server
            </label>
            <span className="font-mono text-text">
              {replicas}
              {replicas === 1 && <span className="text-danger"> · naive</span>}
            </span>
          </div>
          <input
            id="replicas"
            type="range"
            min={1}
            max={60}
            value={replicas}
            disabled={loading}
            onChange={(e) => setReplicasLocal(Number(e.target.value))}
            onPointerUp={() => fire({ type: "setReplicas", n: replicas })}
            onKeyUp={() => fire({ type: "setReplicas", n: replicas })}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        {/* Node controls */}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => fire({ type: "addNode" })}
            disabled={loading || aliveNodes.length >= MAX_NODES}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-muted transition-colors hover:border-healthy/40 hover:text-healthy disabled:opacity-40"
          >
            <PlusCircle size={12} aria-hidden />
            Add node
          </button>
          {aliveNodes.map((n) => (
            <button
              key={n.id}
              onClick={() => fire({ type: "removeNode", id: n.id })}
              disabled={loading || aliveNodes.length <= 1}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: colorFor(nodes, n.id) }}
              />
              Remove {n.name}
            </button>
          ))}
        </div>
      </SoftCard>

      {/* Distribution */}
      <Distribution nodes={nodes} keys={keys} />

      {/* Key input */}
      <SoftCard className="flex flex-col gap-3 p-4">
        <p className="text-xs font-medium text-muted">Add a key to the ring</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKey(keyInput)}
            placeholder="e.g. user:42"
            maxLength={32}
            className="flex-1 rounded-xl border border-border bg-page px-3 py-2 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus-visible:border-flow focus-visible:ring-2 focus-visible:ring-flow"
          />
          <button
            onClick={() => addKey(keyInput)}
            disabled={loading || !keyInput.trim()}
            className="rounded-xl bg-accent px-4 py-2 text-sm text-onAccent disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESET_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => addKey(k)}
              disabled={loading}
              className="rounded-lg border border-border px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-muted hover:text-text disabled:opacity-40"
            >
              {k}
            </button>
          ))}
        </div>
      </SoftCard>

      {/* Ownership table */}
      <OwnershipTable nodes={nodes} keys={keys} />

      {/* Reset */}
      <div className="flex justify-end">
        <button
          onClick={() => fire({ type: "reset" })}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden />
          Reset
        </button>
      </div>

      <TelemetryLog entries={log} label="Hash Ring Log" />
    </div>
  );
}
