"use client";

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, RefreshCw, Zap } from "lucide-react";
import type { FallbackMode, FallbackState } from "@/lib/types";
import { useEventStream } from "@/hooks/useEventStream";
import { SoftCard } from "@/components/ui/SoftCard";
import { StatChip } from "@/components/ui/StatChip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TelemetryLog } from "@/components/ui/TelemetryLog";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

const INITIAL_STATE: FallbackState = {
  mode: "withFallback",
  primaryHealthy: true,
  stats: { primary: 0, fallback: 0, failed: 0 },
  log: [],
};

const MODE_OPTIONS = [
  { value: "withFallback" as FallbackMode, label: "With fallback" },
  { value: "noFallback" as FallbackMode, label: "No fallback" },
];

async function postIntent(body: Record<string, unknown>) {
  await fetch("/api/fallback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Two-branch flow diagram ───────────────────────────────────────────────────

function FlowDiagram({
  primaryHealthy,
  mode,
  lastOutcome,
}: {
  primaryHealthy: boolean;
  mode: FallbackMode;
  lastOutcome: "primary" | "fallback" | "failed" | null;
}) {
  const reduced = useReducedMotion();
  const hasFallback = mode === "withFallback";

  const primaryActive = lastOutcome === "primary";
  const fallbackActive = lastOutcome === "fallback";
  const failedActive = lastOutcome === "failed";

  return (
    <div className="flex flex-col items-center gap-4 py-2 font-mono text-xs">
      {/* Client node */}
      <div className="rounded-full border border-border bg-card px-4 py-1.5 text-muted">
        Client
      </div>

      {/* Arrow down */}
      <div className="h-6 w-0.5 bg-track" />

      {/* Gateway */}
      <div className="rounded-full border border-border bg-card px-4 py-1.5 text-muted">
        Gateway
      </div>

      {/* Fork */}
      <div className="flex w-full items-start justify-center gap-8">
        {/* Primary branch */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-0.5 bg-track" />
          <div
            className={`rounded-xl border px-4 py-2 text-center transition-colors ${
              primaryHealthy
                ? primaryActive
                  ? "border-healthy/60 bg-healthy/10 text-healthy"
                  : "border-border text-muted"
                : "border-danger/40 text-danger opacity-60"
            }`}
          >
            Primary
            {!primaryHealthy && <div className="mt-0.5 text-[10px]">BROKEN</div>}
          </div>
          {primaryActive && !reduced && (
            <motion.div
              className="text-healthy"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              ✓ OK
            </motion.div>
          )}
        </div>

        {/* Fallback branch */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-0.5 bg-track" />
          <div
            className={`rounded-xl border px-4 py-2 text-center transition-colors ${
              !hasFallback
                ? "border-dashed border-border text-muted opacity-40"
                : fallbackActive
                  ? "border-warning/60 bg-warning/10 text-warning"
                  : "border-border text-muted"
            }`}
          >
            Plan B
            {!hasFallback && <div className="mt-0.5 text-[10px]">DISABLED</div>}
          </div>
          {failedActive && !reduced && (
            <motion.div
              className="text-danger"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              ✗ Failed
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Fallback() {
  const state = useEventStream<FallbackState>("/api/fallback/stream", INITIAL_STATE);
  const [loading, setLoading] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<"primary" | "fallback" | "failed" | null>(null);

  const fire = useCallback(async (body: Record<string, unknown>) => {
    const key = JSON.stringify(body);
    setLoading(key);
    await postIntent(body);
    setLoading(null);
  }, []);

  const sendRequest = useCallback(async () => {
    const prevFallback = state.stats.fallback;
    const prevFailed = state.stats.failed;
    setLoading("send");
    await postIntent({ type: "sendRequest" });
    setLoading(null);
    // Derive outcome from which counter incremented
    const snap = state; // SSE will have updated by now
    if (snap.stats.fallback > prevFallback) setLastOutcome("fallback");
    else if (snap.stats.failed > prevFailed) setLastOutcome("failed");
    else setLastOutcome("primary");
  }, [state]);

  const { mode, primaryHealthy, stats, log } = state;

  // Derive last outcome from log
  const lastLog = log[log.length - 1];
  const derivedOutcome: "primary" | "fallback" | "failed" | null = lastLog
    ? lastLog.tone === "healthy"
      ? "primary"
      : lastLog.tone === "warning"
        ? "fallback"
        : lastLog.tone === "danger"
          ? "failed"
          : lastOutcome
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Fallback</h1>
          <p className="mt-1 text-sm text-muted">
            When the primary fails, cockatiel catches the error and serves a cached
            Plan B response — zero downtime. Disable fallback to see hard failure.
          </p>
        </div>
        <RealModeledBadge kind="REAL" />
      </div>

      {/* Mode selector */}
      <SoftCard className="flex items-center justify-between gap-4 p-4">
        <span className="text-sm text-muted">
          {mode === "withFallback"
            ? "Fallback active — primary failure is transparent to the caller."
            : "No fallback — primary failure surfaces as an error."}
        </span>
        <SegmentedControl
          label="Fallback mode"
          options={MODE_OPTIONS}
          value={mode}
          onChange={(m) => fire({ type: "setMode", mode: m })}
        />
      </SoftCard>

      {/* Flow diagram */}
      <SoftCard className="p-6">
        <FlowDiagram
          primaryHealthy={primaryHealthy}
          mode={mode}
          lastOutcome={derivedOutcome}
        />
      </SoftCard>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <SoftCard className="p-4">
          <StatChip label="Primary" value={stats.primary} tone="healthy" />
        </SoftCard>
        <SoftCard className="p-4">
          <StatChip label="Plan B" value={stats.fallback} tone="warning" />
        </SoftCard>
        <SoftCard className="p-4">
          <StatChip label="Failed" value={stats.failed} tone="danger" />
        </SoftCard>
      </div>

      {/* Controls */}
      <SoftCard className="flex flex-wrap gap-3 p-4">
        <button
          onClick={sendRequest}
          disabled={loading !== null}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm text-onAccent disabled:opacity-50"
        >
          <Activity size={14} aria-hidden />
          Send request
        </button>
        <button
          onClick={() => fire({ type: "togglePrimary" })}
          disabled={loading !== null}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-text transition-colors hover:border-muted disabled:opacity-50"
        >
          <Zap size={14} aria-hidden />
          {primaryHealthy ? "Break primary" : "Heal primary"}
        </button>
        <button
          onClick={() => fire({ type: "reset" })}
          disabled={loading !== null}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden />
          Reset
        </button>
      </SoftCard>

      <TelemetryLog entries={log} label="Fallback Log" />
    </div>
  );
}
