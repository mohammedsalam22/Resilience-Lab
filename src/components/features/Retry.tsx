"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Play, RefreshCw, Zap } from "lucide-react";
import type { BackoffMode, RetryAttempt, RetryState } from "@/lib/types";
import { useEventStream } from "@/hooks/useEventStream";
import { SoftCard } from "@/components/ui/SoftCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TelemetryLog } from "@/components/ui/TelemetryLog";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

const INITIAL_STATE: RetryState = {
  backoffMode: "expo",
  jitter: false,
  serviceHealthy: true,
  status: "idle",
  waitingSince: null,
  currentDelay: null,
  attempts: [],
  log: [],
};

const BACKOFF_OPTIONS: { value: BackoffMode; label: string }[] = [
  { value: "expo", label: "Exponential" },
  { value: "fixed", label: "No backoff (200ms)" },
];

// Largest expo delay (8s) sets the bar scale so growth is visible.
const MAX_BAR_DELAY = 8_000;

// ── Live countdown to next retry ──────────────────────────────────────────────

function computeRemaining(
  waitingSince: number | null,
  currentDelay: number | null,
) {
  if (waitingSince === null || currentDelay === null) return 0;
  return Math.max(0, currentDelay - (Date.now() - waitingSince));
}

function useCountdown(waitingSince: number | null, currentDelay: number | null) {
  const reduced = useReducedMotion();
  const [remaining, setRemaining] = useState(() =>
    computeRemaining(waitingSince, currentDelay),
  );

  useEffect(() => {
    if (waitingSince === null || currentDelay === null || reduced) return;

    let frame = 0;
    const tick = () => {
      const left = computeRemaining(waitingSince, currentDelay);
      setRemaining(left);
      if (left > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [waitingSince, currentDelay, reduced]);

  return remaining;
}

function Countdown({
  waitingSince,
  currentDelay,
}: {
  waitingSince: number | null;
  currentDelay: number | null;
}) {
  const remaining = useCountdown(waitingSince, currentDelay);
  if (waitingSince === null || currentDelay === null) return null;

  const pct = 1 - remaining / currentDelay;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>Next retry in</span>
        <span>{(remaining / 1000).toFixed(1)}s</span>
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

// ── Attempt timeline (growing bars) ───────────────────────────────────────────

const OUTCOME_BAR: Record<RetryAttempt["outcome"], string> = {
  pending: "bg-flow",
  success: "bg-healthy",
  failure: "bg-danger",
};

function AttemptTimeline({ attempts }: { attempts: RetryAttempt[] }) {
  const reduced = useReducedMotion();
  if (attempts.length === 0) {
    return (
      <p className="text-sm text-muted">
        No attempts yet — press <span className="text-text">Run</span> to start.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {attempts.map((a) => {
        // Bar width scales with the backoff delay that PRECEDED this attempt;
        // attempt 1 has none, so show a small baseline.
        const widthPct =
          a.delayBeforeNext !== null
            ? Math.max(8, (a.delayBeforeNext / MAX_BAR_DELAY) * 100)
            : a.attempt === 1
              ? 8
              : 8;
        return (
          <div key={a.attempt} className="flex items-center gap-3">
            <span className="w-16 shrink-0 font-mono text-xs text-muted">
              #{a.attempt}
            </span>
            <div className="flex h-3 flex-1 items-center">
              <motion.div
                initial={reduced ? false : { width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: reduced ? 0 : 0.3 }}
                className={`h-2 rounded-full ${OUTCOME_BAR[a.outcome]}`}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-xs text-muted">
              {a.delayBeforeNext !== null
                ? `${Math.round(a.delayBeforeNext)}ms`
                : a.outcome === "pending"
                  ? "…"
                  : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Intent POST ───────────────────────────────────────────────────────────────

async function postIntent(body: Record<string, unknown>) {
  await fetch("/api/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export function Retry() {
  const state = useEventStream<RetryState>("/api/retry/stream", INITIAL_STATE);
  const { backoffMode, jitter, serviceHealthy, status, attempts, log } = state;
  const running = status === "running";

  const setMode = useCallback(
    (mode: BackoffMode) => postIntent({ type: "setBackoffMode", mode }),
    [],
  );

  const statusLabel: Record<RetryState["status"], { text: string; tone: string }> = {
    idle: { text: "Idle", tone: "text-muted" },
    running: { text: "Running…", tone: "text-flow" },
    succeeded: { text: "Succeeded", tone: "text-healthy" },
    failed: { text: "Gave up", tone: "text-danger" },
  };

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Retry + Backoff</h1>
          <p className="mt-1 text-sm text-muted">
            Up to 5 attempts against a real flaky service, waiting longer between each.
          </p>
        </div>
        <RealModeledBadge kind="REAL" />
      </div>

      {/* backoff selector + blurb */}
      <SoftCard className="flex flex-col gap-3 p-5">
        <SegmentedControl
          label="Backoff strategy"
          options={BACKOFF_OPTIONS}
          value={backoffMode}
          onChange={setMode}
        />
        <p className="text-sm text-muted">
          {backoffMode === "expo"
            ? "Exponential: waits 1s, 2s, 4s, 8s — backing off as failures persist."
            : "No backoff: a flat 200ms between every retry — hammers a struggling service."}
        </p>
      </SoftCard>

      {/* status + countdown */}
      <SoftCard className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <span className={`font-mono text-sm font-medium ${statusLabel[status].tone}`}>
            {statusLabel[status].text}
          </span>
          <span className="font-mono text-xs text-muted">
            {attempts.length}/5 attempts
          </span>
        </div>
        <Countdown waitingSince={state.waitingSince} currentDelay={state.currentDelay} />
        <AttemptTimeline attempts={attempts} />
      </SoftCard>

      {/* controls */}
      <SoftCard className="flex flex-wrap items-center gap-3 p-4">
        <button
          onClick={() => postIntent({ type: "run" })}
          disabled={running}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm text-onAccent transition-opacity disabled:opacity-50"
        >
          <Play size={14} aria-hidden />
          Run
        </button>

        <button
          onClick={() => postIntent({ type: "toggleService" })}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-text transition-colors hover:border-muted"
        >
          <Zap size={14} aria-hidden />
          {serviceHealthy ? "Break service" : "Heal service"}
        </button>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={jitter}
            disabled={running}
            onChange={(e) => postIntent({ type: "setJitter", jitter: e.target.checked })}
            className="size-4 accent-[var(--flow)] disabled:opacity-50"
          />
          Jitter
        </label>

        <button
          onClick={() => postIntent({ type: "reset" })}
          disabled={running}
          className="ml-auto flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden />
          Reset
        </button>
      </SoftCard>

      {/* telemetry */}
      <TelemetryLog entries={log} label="Retry Log" />
    </div>
  );
}
