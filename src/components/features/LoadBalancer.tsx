"use client";

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, RefreshCw, Radio } from "lucide-react";
import type { Algorithm, LoadBalancerState, Worker } from "@/lib/types";
import { useEventStream } from "@/hooks/useEventStream";
import { SoftCard } from "@/components/ui/SoftCard";
import { StatChip } from "@/components/ui/StatChip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TelemetryLog } from "@/components/ui/TelemetryLog";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

// ── Constants ─────────────────────────────────────────────────────────────────

const OVERLOAD_AT = 5;

const INITIAL_STATE: LoadBalancerState = {
  workers: [
    { id: "a", name: "A", weight: 4, slow: false, down: false, handled: 0 },
    { id: "b", name: "B", weight: 2, slow: false, down: false, handled: 0 },
    { id: "c", name: "C", weight: 1, slow: false, down: false, handled: 0 },
    { id: "d", name: "D", weight: 3, slow: false, down: false, handled: 0 },
  ],
  inFlight: [],
  algorithm: "rr",
  streaming: false,
  stats: { routed: 0, dropped: 0 },
  cluster: false,
  log: [],
};

const ALGO_OPTIONS = [
  { value: "rr" as Algorithm, label: "Round Robin" },
  { value: "wrr" as Algorithm, label: "Weighted" },
  { value: "lc" as Algorithm, label: "Least Conn" },
  { value: "p2c" as Algorithm, label: "Power of 2" },
  { value: "sticky" as Algorithm, label: "Sticky" },
  { value: "lrt" as Algorithm, label: "Least RT" },
  { value: "jiq" as Algorithm, label: "JIQ" },
  { value: "adaptive" as Algorithm, label: "Adaptive" },
];

const ALGO_BLURBS: Record<Algorithm, string> = {
  rr: "Each request goes to the next worker in a fixed cycle, regardless of load.",
  wrr: "Workers receive traffic proportional to their weight (A×4, B×2, C×1, D×3).",
  lc: "Every request is routed to whichever worker currently has the fewest active connections.",
  p2c: "Two workers are sampled at random; the one with fewer connections wins.",
  sticky: "Each client (by ID) is always sent to the same worker — useful for session affinity.",
  lrt: "Routes to the worker with the lowest estimated remaining response time.",
  jiq: "Joins the queue of an idle worker first; falls back to least connections if none are idle.",
  adaptive: "Scores workers by throughput (handled / active+1); favors the fastest over time.",
};

// ── Intent helper ─────────────────────────────────────────────────────────────

async function postIntent(body: Record<string, unknown>) {
  await fetch("/api/load-balancer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Worker column ─────────────────────────────────────────────────────────────

function WorkerColumn({
  worker,
  active,
  onToggleSlow,
  onToggleDown,
  disabled,
}: {
  worker: Worker;
  active: number;
  onToggleSlow: () => void;
  onToggleDown: () => void;
  disabled: boolean;
}) {
  const reduced = useReducedMotion();
  const overloaded = active >= OVERLOAD_AT;
  const warned = active >= 3 && !overloaded;

  const barColor = worker.down
    ? "bg-border"
    : overloaded
      ? "bg-danger"
      : warned
        ? "bg-warning"
        : "bg-healthy";

  const barPct = Math.min(active / OVERLOAD_AT, 1) * 100;

  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
        worker.down ? "border-border opacity-50" : "border-border"
      }`}
    >
      {/* Bar */}
      <div className="relative flex h-24 w-full flex-col justify-end overflow-hidden rounded-lg bg-track">
        {worker.down && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="font-mono text-xs font-medium text-muted">DOWN</span>
          </div>
        )}
        {!worker.down && (
          <motion.div
            className={`w-full rounded-b-lg transition-colors ${barColor}`}
            style={{ height: reduced ? `${barPct}%` : undefined }}
            animate={reduced ? undefined : { height: `${barPct}%` }}
            transition={{ duration: 0.3 }}
          />
        )}
        {overloaded && !worker.down && (
          <span
            aria-label="overloaded"
            className="absolute inset-0 flex items-center justify-center text-lg"
          >
            🔥
          </span>
        )}
      </div>

      {/* Name + weight badge */}
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-sm font-semibold text-text">
          {worker.name}
        </span>
        <span className="rounded-full bg-track px-2 py-0.5 font-mono text-xs text-muted">
          w{worker.weight}
        </span>
      </div>

      {/* Active + handled */}
      <div className="flex w-full justify-between font-mono text-xs text-muted">
        <span>
          <span className={overloaded ? "text-danger" : warned ? "text-warning" : "text-healthy"}>
            {active}
          </span>
          /{OVERLOAD_AT} active
        </span>
        <span>{worker.handled} done</span>
      </div>

      {/* Slow / Down toggles */}
      <div className="flex w-full gap-1.5">
        <button
          onClick={onToggleSlow}
          disabled={disabled || worker.down}
          className={`flex-1 rounded-lg border px-2 py-1 text-xs transition-colors disabled:opacity-40 ${
            worker.slow
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-border text-muted hover:border-muted hover:text-text"
          }`}
        >
          {worker.slow ? "Slow ✓" : "Slow"}
        </button>
        <button
          onClick={onToggleDown}
          disabled={disabled}
          className={`flex-1 rounded-lg border px-2 py-1 text-xs transition-colors disabled:opacity-40 ${
            worker.down
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border text-muted hover:border-muted hover:text-text"
          }`}
        >
          {worker.down ? "Down ✓" : "Down"}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LoadBalancer() {
  const state = useEventStream<LoadBalancerState>(
    "/api/load-balancer/stream",
    INITIAL_STATE,
  );
  const [loading, setLoading] = useState<string | null>(null);

  const fire = useCallback(async (body: Record<string, unknown>) => {
    const key = JSON.stringify(body);
    setLoading(key);
    await postIntent(body);
    setLoading(null);
  }, []);

  const { workers, inFlight, algorithm, streaming, stats, log } = state;

  const activeFor = (id: string) => inFlight.filter((f) => f.workerId === id).length;
  const busy = loading !== null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Load Balancer</h1>
          <p className="mt-1 text-sm text-muted">
            Route live traffic across 4 workers. Mark a worker slow, then watch
            how Least Connections or P2C drains load away from it.
          </p>
        </div>
        <RealModeledBadge kind={state.cluster ? "REAL" : "MODELED"} />
      </div>

      {/* Algorithm selector */}
      <SoftCard className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text">Algorithm</span>
          <SegmentedControl
            label="Routing algorithm"
            options={ALGO_OPTIONS}
            value={algorithm}
            onChange={(algo) => fire({ type: "setAlgorithm", algo })}
          />
        </div>
        <p className="text-xs text-muted">{ALGO_BLURBS[algorithm]}</p>
      </SoftCard>

      {/* Worker columns */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {workers.map((w) => (
          <WorkerColumn
            key={w.id}
            worker={w}
            active={activeFor(w.id)}
            onToggleSlow={() => fire({ type: "toggleSlow", id: w.id })}
            onToggleDown={() => fire({ type: "toggleDown", id: w.id })}
            disabled={busy}
          />
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <SoftCard className="p-4">
          <StatChip label="Routed" value={stats.routed} tone="healthy" />
        </SoftCard>
        <SoftCard className="p-4">
          <StatChip label="Dropped" value={stats.dropped} tone="danger" />
        </SoftCard>
      </div>

      {/* Controls */}
      <SoftCard className="flex flex-wrap gap-3 p-4">
        <button
          onClick={() => fire({ type: "sendRequest" })}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm text-onAccent transition-opacity disabled:opacity-50"
        >
          <Activity size={14} aria-hidden />
          Send request
        </button>

        <button
          onClick={() => fire({ type: "toggleStream" })}
          disabled={busy}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors disabled:opacity-50 ${
            streaming
              ? "border-flow/40 bg-flow/10 text-flow"
              : "border-border bg-card text-text hover:border-muted"
          }`}
        >
          <Radio size={14} aria-hidden />
          {streaming ? "Stop stream" : "Stream traffic"}
        </button>

        <button
          onClick={() => fire({ type: "reset" })}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden />
          Reset
        </button>
      </SoftCard>

      {/* Telemetry */}
      <TelemetryLog entries={log} label="Load Balancer Log" />
    </div>
  );
}
