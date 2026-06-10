"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import type { HealthCheckState, HealthNode } from "@/lib/types";
import { useEventStream } from "@/hooks/useEventStream";
import { SoftCard } from "@/components/ui/SoftCard";
import { TelemetryLog } from "@/components/ui/TelemetryLog";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

// ── Constants ─────────────────────────────────────────────────────────────────

const MISS_THRESHOLD = 2;

const INITIAL_STATE: HealthCheckState = {
  nodes: [
    { id: "n1", name: "Node 1", beating: true, missed: 0, healthy: true, inPool: true },
    { id: "n2", name: "Node 2", beating: true, missed: 0, healthy: true, inPool: true },
    { id: "n3", name: "Node 3", beating: true, missed: 0, healthy: true, inPool: true },
    { id: "n4", name: "Node 4", beating: true, missed: 0, healthy: true, inPool: true },
  ],
  cluster: false,
  log: [],
};

// ── Intent helper ─────────────────────────────────────────────────────────────

async function postIntent(body: Record<string, unknown>) {
  await fetch("/api/health-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Heartbeat pulse animation ─────────────────────────────────────────────────

function HeartbeatPulse({ beating }: { beating: boolean }) {
  const reduced = useReducedMotion();

  if (!beating || reduced) {
    return (
      <span
        className={`inline-block size-3 rounded-full ${beating ? "bg-healthy" : "bg-track"}`}
      />
    );
  }

  return (
    <span className="relative inline-flex size-3">
      <motion.span
        className="absolute inline-flex size-full rounded-full bg-healthy opacity-75"
        animate={{ scale: [1, 1.8], opacity: [0.75, 0] }}
        transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
      />
      <span className="relative inline-flex size-3 rounded-full bg-healthy" />
    </span>
  );
}

// ── Miss progress dots ────────────────────────────────────────────────────────

function MissDots({ missed }: { missed: number }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`size-2 rounded-full transition-colors ${
            i < missed ? "bg-warning" : "bg-track"
          }`}
        />
      ))}
      <span className="ml-1 font-mono text-xs text-muted">/{MISS_THRESHOLD}</span>
    </div>
  );
}

// ── Countdown to next poll ────────────────────────────────────────────────────

function PollCountdown() {
  const reduced = useReducedMotion();
  const [pct, setPct] = useState(0);
  const startRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (reduced) return;
    startRef.current = Date.now();

    const tick = () => {
      const elapsed = (Date.now() - startRef.current) % 1000;
      setPct(elapsed / 1000);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [reduced]);

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-xs text-muted">Poll interval</span>
      <div className="h-1 overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full bg-flow"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Node card ─────────────────────────────────────────────────────────────────

function NodeCard({
  node,
  onSilence,
  onResume,
  disabled,
}: {
  node: HealthNode;
  onSilence: () => void;
  onResume: () => void;
  disabled: boolean;
}) {
  return (
    <SoftCard
      className={`flex flex-col gap-3 p-4 transition-colors ${
        !node.healthy ? "border-danger/40" : node.beating ? "" : "border-warning/40"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartbeatPulse beating={node.beating} />
          <span className="font-mono text-sm font-medium text-text">{node.name}</span>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
            node.healthy
              ? "border-healthy/40 text-healthy"
              : "border-danger/40 text-danger"
          }`}
        >
          {node.inPool ? "In pool" : "Out of pool"}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${
            node.healthy ? "text-healthy" : "text-danger"
          }`}
        >
          {node.healthy ? (node.beating ? "Healthy" : "Degrading…") : "Unhealthy"}
        </span>
        {!node.beating && <MissDots missed={node.missed} />}
      </div>

      {/* Silence / Resume toggle */}
      <button
        onClick={node.beating ? onSilence : onResume}
        disabled={disabled}
        className={`w-full rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
          node.beating
            ? "border-border text-muted hover:border-warning/40 hover:text-warning"
            : "border-healthy/40 text-healthy hover:bg-healthy/10"
        }`}
      >
        {node.beating ? "Silence heartbeat" : "Resume heartbeat"}
      </button>
    </SoftCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function HealthCheck() {
  const state = useEventStream<HealthCheckState>(
    "/api/health-check/stream",
    INITIAL_STATE,
  );
  const [loading, setLoading] = useState<string | null>(null);

  const fire = useCallback(async (body: Record<string, unknown>) => {
    const key = JSON.stringify(body);
    setLoading(key);
    await postIntent(body);
    setLoading(null);
  }, []);

  const { nodes, log } = state;
  const healthyCount = nodes.filter((n) => n.inPool).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Health Check + Heartbeat</h1>
          <p className="mt-1 text-sm text-muted">
            Each node sends a heartbeat every second. Miss {MISS_THRESHOLD} in a row
            and the node is removed from the pool.
          </p>
        </div>
        <RealModeledBadge kind={state.cluster ? "REAL" : "MODELED"} />
      </div>

      {/* Pool summary + poll bar */}
      <SoftCard className="flex items-center justify-between gap-6 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-2xl tabular-nums text-healthy">
            {healthyCount}
            <span className="text-base text-muted">/{nodes.length}</span>
          </span>
          <span className="text-xs text-muted">nodes in pool</span>
        </div>
        <div className="flex-1">
          <PollCountdown />
        </div>
        <button
          onClick={() => fire({ type: "reset" })}
          disabled={loading !== null}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden />
          Reset
        </button>
      </SoftCard>

      {/* Node grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            onSilence={() => fire({ type: "silence", id: node.id })}
            onResume={() => fire({ type: "resume", id: node.id })}
            disabled={loading !== null}
          />
        ))}
      </div>

      {/* LB tie-in callout */}
      <SoftCard className="p-4">
        <p className="text-sm text-muted">
          <span className="font-medium text-text">LB tie-in:</span> An unhealthy node is
          exactly what leaves the load balancer&apos;s pool. Silence a node here, watch it
          drop out, then resume it to see it recover.
        </p>
      </SoftCard>

      {/* Telemetry */}
      <TelemetryLog entries={log} label="Health Check Log" />
    </div>
  );
}
