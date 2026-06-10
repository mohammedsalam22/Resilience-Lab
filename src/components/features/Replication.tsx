"use client";

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw, Skull, Send } from "lucide-react";
import type { Replica, ReplicationMode, ReplicationState } from "@/lib/types";
import { useEventStream } from "@/hooks/useEventStream";
import { SoftCard } from "@/components/ui/SoftCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TelemetryLog } from "@/components/ui/TelemetryLog";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

const INITIAL_STATE: ReplicationState = {
  mode: "active",
  replicas: [
    { id: "r0", name: "R0", role: "primary", alive: true, ops: 0, walEntries: 0 },
    { id: "r1", name: "R1", role: "backup",  alive: true, ops: 0, walEntries: 0 },
    { id: "r2", name: "R2", role: "backup",  alive: true, ops: 0, walEntries: 0 },
  ],
  lastCommand: null,
  electing: false,
  cluster: false,
  log: [],
};

const MODE_OPTIONS = [
  { value: "active" as ReplicationMode, label: "Active" },
  { value: "passive" as ReplicationMode, label: "Passive" },
];

const PRESET_COMMANDS = ["SET x=1", "PUT user:42", "DEL cache:A", "INC counter"];

async function postIntent(body: Record<string, unknown>) {
  await fetch("/api/replication", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Replica node card ─────────────────────────────────────────────────────────

function ReplicaCard({
  replica,
  mode,
  onKill,
  disabled,
}: {
  replica: Replica;
  mode: ReplicationMode;
  onKill: () => void;
  disabled: boolean;
}) {
  const reduced = useReducedMotion();

  return (
    <SoftCard
      className={`flex flex-col gap-3 p-4 transition-colors ${
        !replica.alive
          ? "border-danger/30 opacity-50"
          : replica.role === "primary"
            ? "border-healthy/40"
            : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {replica.alive && !reduced && (
            <motion.span
              className={`size-2 rounded-full ${
                replica.role === "primary" ? "bg-healthy" : "bg-flow"
              }`}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
          {(!replica.alive || reduced) && (
            <span className="size-2 rounded-full bg-track" />
          )}
          <span className="font-mono text-sm font-semibold text-text">{replica.name}</span>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
            !replica.alive
              ? "border-danger/40 text-danger"
              : replica.role === "primary"
                ? "border-healthy/40 text-healthy"
                : "border-flow/40 text-flow"
          }`}
        >
          {!replica.alive ? "DEAD" : replica.role}
        </span>
      </div>

      {/* Stats */}
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>{replica.ops} ops</span>
        {mode === "passive" && <span>{replica.walEntries} WAL</span>}
      </div>

      {/* Kill button */}
      <button
        onClick={onKill}
        disabled={disabled || !replica.alive}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-30"
      >
        <Skull size={10} aria-hidden />
        Kill
      </button>
    </SoftCard>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────

function ComparisonTable() {
  const rows = [
    { aspect: "Processing", active: "All replicas apply every op", passive: "Primary only; backups replay WAL" },
    { aspect: "Failover time", active: "Instant — no election needed", passive: "Brief pause for election (~1.5 s)" },
    { aspect: "Consistency", active: "Strong — all agree at all times", passive: "Eventual — backups lag behind primary" },
    { aspect: "Cost", active: "Higher CPU (N × work per op)", passive: "Lower CPU; primary is the bottleneck" },
  ];

  return (
    <SoftCard className="overflow-hidden p-0">
      <table className="w-full text-xs">
        <caption className="sr-only">Active versus passive replication compared across processing, failover time, consistency, and cost.</caption>
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-2.5 text-left font-medium text-muted">Aspect</th>
            <th className="px-4 py-2.5 text-left font-medium text-healthy">Active</th>
            <th className="px-4 py-2.5 text-left font-medium text-flow">Passive</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.aspect} className="border-b border-border last:border-0">
              <td className="px-4 py-2 font-medium text-text">{row.aspect}</td>
              <td className="px-4 py-2 text-muted">{row.active}</td>
              <td className="px-4 py-2 text-muted">{row.passive}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SoftCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Replication() {
  const state = useEventStream<ReplicationState>("/api/replication/stream", INITIAL_STATE);
  const [cmdInput, setCmdInput] = useState("");
  const [loading, setLoading] = useState(false);

  const fire = useCallback(async (body: Record<string, unknown>) => {
    setLoading(true);
    await postIntent(body);
    setLoading(false);
  }, []);

  const sendCmd = useCallback(
    async (cmd: string) => {
      const c = cmd.trim();
      if (!c) return;
      await fire({ type: "sendCommand", command: c });
      setCmdInput("");
    },
    [fire],
  );

  const { mode, replicas, electing, log } = state;
  const aliveCount = replicas.filter((r) => r.alive).length;
  const reduced = useReducedMotion();

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Replication</h1>
          <p className="mt-1 text-sm text-muted">
            Active: every replica applies each command. Passive: primary applies + ships
            WAL to backups; kill the primary to trigger election.
          </p>
        </div>
        <RealModeledBadge kind={state.cluster ? "REAL" : "MODELED"} />
      </div>

      {/* Mode selector */}
      <SoftCard className="flex items-center justify-between gap-4 p-4">
        <span className="text-sm text-muted">
          {mode === "active"
            ? "Active — all replicas process every command."
            : "Passive — primary applies commands; backups follow WAL."}
        </span>
        <SegmentedControl
          label="Replication mode"
          options={MODE_OPTIONS}
          value={mode}
          onChange={(m) => fire({ type: "setMode", mode: m })}
        />
      </SoftCard>

      {/* Election banner */}
      {electing && (
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          ⚡ Election in progress — promoting backup with most WAL entries…
        </motion.div>
      )}

      {/* Replica grid */}
      <div className="grid grid-cols-3 gap-3">
        {replicas.map((r) => (
          <ReplicaCard
            key={r.id}
            replica={r}
            mode={mode}
            onKill={() => fire({ type: "killReplica", id: r.id })}
            disabled={loading}
          />
        ))}
      </div>

      {/* Pool summary */}
      <div className="flex items-center gap-2 font-mono text-xs text-muted">
        <span className={aliveCount > 0 ? "text-healthy" : "text-danger"}>
          {aliveCount}/{replicas.length} alive
        </span>
      </div>

      {/* Command input */}
      <SoftCard className="flex flex-col gap-3 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={cmdInput}
            onChange={(e) => setCmdInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCmd(cmdInput)}
            placeholder="Command (e.g. SET x=1)"
            maxLength={64}
            className="flex-1 rounded-xl border border-border bg-page px-3 py-2 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus-visible:border-flow focus-visible:ring-2 focus-visible:ring-flow"
          />
          <button
            onClick={() => sendCmd(cmdInput)}
            disabled={loading || !cmdInput.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm text-onAccent disabled:opacity-50"
          >
            <Send size={14} aria-hidden />
            Send
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESET_COMMANDS.map((c) => (
            <button
              key={c}
              onClick={() => sendCmd(c)}
              disabled={loading}
              className="rounded-lg border border-border px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-muted hover:text-text disabled:opacity-40"
            >
              {c}
            </button>
          ))}
        </div>
      </SoftCard>

      {/* Comparison table */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted">Active vs Passive</p>
        <ComparisonTable />
      </div>

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

      <TelemetryLog entries={log} label="Replication Log" />
    </div>
  );
}
