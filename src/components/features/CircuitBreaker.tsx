"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, RefreshCw, Zap } from "lucide-react";
import type { BreakerMode, BreakerState } from "@/lib/types";
import { useEventStream } from "@/hooks/useEventStream";
import { SoftCard } from "@/components/ui/SoftCard";
import { StatChip } from "@/components/ui/StatChip";
import { TelemetryLog } from "@/components/ui/TelemetryLog";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

// ── Constants ─────────────────────────────────────────────────────────────────

const HALF_OPEN_AFTER_MS = 5_000;

const INITIAL_STATE: BreakerState = {
  mode: "closed",
  stats: { passed: 0, failed: 0, rejected: 0, trips: 0 },
  serviceHealthy: true,
  openedAt: null,
  log: [],
};

const MODE_LABELS: Record<BreakerMode, string> = {
  closed: "Closed",
  open: "Open",
  halfOpen: "Half-Open",
};

const MODE_DOT_CLASS: Record<BreakerMode, string> = {
  closed: "bg-healthy",
  open: "bg-danger",
  halfOpen: "bg-warning",
};

const MODE_TEXT_CLASS: Record<BreakerMode, string> = {
  closed: "text-healthy",
  open: "text-danger",
  halfOpen: "text-warning",
};

// ── Cooldown bar ──────────────────────────────────────────────────────────────

function useCooldownPct(openedAt: number | null): number {
  const reduced = useReducedMotion();
  const [pct, setPct] = useState(() =>
    openedAt !== null ? Math.min((Date.now() - openedAt) / HALF_OPEN_AFTER_MS, 1) : 0,
  );
  const frameRef = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(frameRef.current);
    if (openedAt === null) return;

    const tick = () => {
      const p = Math.min((Date.now() - openedAt) / HALF_OPEN_AFTER_MS, 1);
      setPct(p);
      if (p < 1) frameRef.current = requestAnimationFrame(tick);
    };

    if (!reduced) {
      frameRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(frameRef.current);
  }, [openedAt, reduced]);

  return pct;
}

function CooldownBar({ openedAt }: { openedAt: number | null }) {
  const pct = useCooldownPct(openedAt);

  if (openedAt === null) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>Half-open in</span>
        <span>{Math.max(0, Math.ceil(HALF_OPEN_AFTER_MS / 1000 - (pct * HALF_OPEN_AFTER_MS) / 1000))}s</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full bg-warning"
          style={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
    </div>
  );
}

// ── Flow strip ────────────────────────────────────────────────────────────────

function FlowStrip({ mode }: { mode: BreakerMode }) {
  const reduced = useReducedMotion();
  const isFlowing = mode === "closed";
  const isProbing = mode === "halfOpen";

  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      <div className="rounded-full border border-border bg-card px-3 py-1.5 text-muted">
        Client
      </div>

      {/* connector left */}
      <div className="relative flex h-0.5 flex-1 items-center bg-track overflow-hidden rounded-full">
        {(isFlowing || isProbing) && !reduced && (
          <motion.div
            className={`absolute inset-y-0 w-6 rounded-full ${isProbing ? "bg-warning" : "bg-flow"}`}
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>

      {/* breaker node */}
      <div
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors ${
          mode === "closed"
            ? "border-healthy/40 text-healthy"
            : mode === "open"
              ? "border-danger/40 text-danger"
              : "border-warning/40 text-warning"
        }`}
      >
        <span className={`size-1.5 rounded-full ${MODE_DOT_CLASS[mode]} bg-current`} />
        Breaker
      </div>

      {/* connector right */}
      <div className="relative flex h-0.5 flex-1 items-center bg-track overflow-hidden rounded-full">
        {isFlowing && !reduced && (
          <motion.div
            className="absolute inset-y-0 w-6 rounded-full bg-flow"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear", delay: 0.5 }}
          />
        )}
      </div>

      <div
        className={`rounded-full border px-3 py-1.5 transition-colors ${
          isFlowing || isProbing
            ? "border-healthy/40 text-healthy"
            : "border-border text-muted"
        }`}
      >
        Downstream
      </div>
    </div>
  );
}

// ── Failure dots ──────────────────────────────────────────────────────────────

function FailureDots({ failed }: { failed: number }) {
  const consecutive = Math.min(failed, 3);
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`size-2.5 rounded-full transition-colors ${
            i < consecutive ? "bg-danger" : "bg-track"
          }`}
        />
      ))}
      <span className="ml-1 font-mono text-xs text-muted">/ 3</span>
    </div>
  );
}

// ── Intent POST helper ────────────────────────────────────────────────────────

async function postIntent(type: string) {
  await fetch("/api/circuit-breaker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export function CircuitBreaker() {
  const state = useEventStream<BreakerState>(
    "/api/circuit-breaker/stream",
    INITIAL_STATE,
  );
  const [loading, setLoading] = useState<string | null>(null);

  const fire = useCallback(async (type: string) => {
    setLoading(type);
    await postIntent(type);
    setLoading(null);
  }, []);

  const { mode, stats, serviceHealthy, openedAt, log } = state;

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Circuit Breaker</h1>
          <p className="mt-1 text-sm text-muted">
            3 consecutive failures open the circuit for 5 s; a probe re-closes it.
          </p>
        </div>
        <RealModeledBadge kind="REAL" />
      </div>

      {/* flow strip */}
      <SoftCard className="p-4">
        <FlowStrip mode={mode} />
      </SoftCard>

      {/* status + cooldown */}
      <SoftCard className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${MODE_DOT_CLASS[mode]}`} />
            <span className={`font-mono text-sm font-medium ${MODE_TEXT_CLASS[mode]}`}>
              {MODE_LABELS[mode]}
            </span>
          </div>
          {mode === "halfOpen" && (
            <span className="font-mono text-xs text-warning">
              Probing…
            </span>
          )}
        </div>

        <FailureDots failed={stats.failed} />
        <CooldownBar openedAt={openedAt} />

        {mode === "halfOpen" && (
          <p className="text-xs text-muted">
            Next successful request will close the circuit; another failure will re-open it.
          </p>
        )}
      </SoftCard>

      {/* stat chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SoftCard className="p-4">
          <StatChip label="Passed" value={stats.passed} tone="healthy" />
        </SoftCard>
        <SoftCard className="p-4">
          <StatChip label="Failed" value={stats.failed} tone="warning" />
        </SoftCard>
        <SoftCard className="p-4">
          <StatChip label="Rejected" value={stats.rejected} tone="danger" />
        </SoftCard>
        <SoftCard className="p-4">
          <StatChip label="Trips" value={stats.trips} tone="danger" />
        </SoftCard>
      </div>

      {/* controls */}
      <SoftCard className="flex flex-wrap gap-3 p-4">
        <button
          onClick={() => fire("sendRequest")}
          disabled={loading !== null}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm text-onAccent transition-opacity disabled:opacity-50"
        >
          <Activity size={14} aria-hidden />
          Send request
        </button>

        <button
          onClick={() => fire("toggleService")}
          disabled={loading !== null}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-text transition-colors hover:border-muted disabled:opacity-50"
        >
          <Zap size={14} aria-hidden />
          {serviceHealthy ? "Break service" : "Heal service"}
        </button>

        <button
          onClick={() => fire("reset")}
          disabled={loading !== null}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden />
          Reset
        </button>
      </SoftCard>

      {/* telemetry */}
      <TelemetryLog entries={log} label="Circuit Breaker Log" />
    </div>
  );
}
