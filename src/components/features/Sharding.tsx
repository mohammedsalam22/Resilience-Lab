"use client";

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw, ArrowRight } from "lucide-react";
import type { ShardingState, ShardStrategy } from "@/lib/types";
import { useEventStream } from "@/hooks/useEventStream";
import { SoftCard } from "@/components/ui/SoftCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TelemetryLog } from "@/components/ui/TelemetryLog";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_STATE: ShardingState = {
  strategy: "hash",
  shards: [
    { id: "s0", name: "S0", keys: [] },
    { id: "s1", name: "S1", keys: [] },
    { id: "s2", name: "S2", keys: [] },
    { id: "s3", name: "S3", keys: [] },
  ],
  lastRoute: null,
  log: [],
};

const STRATEGY_OPTIONS = [
  { value: "hash" as ShardStrategy, label: "Hash" },
  { value: "range" as ShardStrategy, label: "Range" },
  { value: "directory" as ShardStrategy, label: "Directory" },
];

const STRATEGY_BLURBS: Record<ShardStrategy, string> = {
  hash: "hash(key) % N — even distribution but rebalancing reshuffles all keys when N changes.",
  range: "First character ranges (A–G, H–N, O–T, U–Z). Simple, but hotspots form around popular letters.",
  directory: "Lookup table maps known keys to fixed shards. Flexible, but the table is a single point of failure.",
};

const PRESET_KEYS = ["user", "order", "product", "session", "apple", "hello", "zebra", "invoice"];

async function postIntent(body: Record<string, unknown>) {
  await fetch("/api/sharding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Shard column ──────────────────────────────────────────────────────────────

function ShardColumn({
  name,
  keys,
  highlighted,
}: {
  name: string;
  keys: string[];
  highlighted: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <SoftCard
      className={`flex flex-col gap-2 p-3 transition-colors ${
        highlighted ? "border-flow/60 bg-flow/5" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-text">{name}</span>
        <span className="rounded-full bg-track px-2 py-0.5 font-mono text-xs text-muted">
          {keys.length}
        </span>
      </div>
      <div className="flex min-h-[4rem] flex-wrap gap-1">
        {keys.map((k) => (
          <motion.span
            key={k}
            initial={reduced ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`rounded-md px-1.5 py-0.5 font-mono text-xs ${
              highlighted ? "bg-flow/20 text-flow" : "bg-track text-muted"
            }`}
          >
            {k}
          </motion.span>
        ))}
      </div>
    </SoftCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Sharding() {
  const state = useEventStream<ShardingState>("/api/sharding/stream", INITIAL_STATE);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();

  const fire = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    await postIntent(body);
    setBusy(false);
  }, []);

  const submit = useCallback(
    async (key: string) => {
      const k = key.trim();
      if (!k) return;
      await fire({ type: "route", key: k });
      setKeyInput("");
    },
    [fire],
  );

  const { strategy, shards, lastRoute, log } = state;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Data Sharding</h1>
          <p className="mt-1 text-sm text-muted">
            Route a key to one of 4 shards using Hash, Range, or Directory strategy.
          </p>
        </div>
        <RealModeledBadge kind="MODELED" />
      </div>

      {/* Strategy selector */}
      <SoftCard className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text">Strategy</span>
          <SegmentedControl
            label="Sharding strategy"
            options={STRATEGY_OPTIONS}
            value={strategy}
            onChange={(s) => fire({ type: "setStrategy", strategy: s })}
          />
        </div>
        <p className="text-xs text-muted">{STRATEGY_BLURBS[strategy]}</p>
      </SoftCard>

      {/* Key input + route result */}
      <SoftCard className="flex flex-col gap-4 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(keyInput)}
            placeholder="Type a key and press Enter…"
            maxLength={64}
            className="flex-1 rounded-xl border border-border bg-page px-3 py-2 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus-visible:border-flow focus-visible:ring-2 focus-visible:ring-flow"
          />
          <button
            onClick={() => submit(keyInput)}
            disabled={busy || !keyInput.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm text-onAccent disabled:opacity-50"
          >
            Route <ArrowRight size={14} aria-hidden />
          </button>
        </div>

        {/* Preset keys */}
        <div className="flex flex-wrap gap-2">
          {PRESET_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => submit(k)}
              disabled={busy}
              className="rounded-lg border border-border px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-muted hover:text-text disabled:opacity-40"
            >
              {k}
            </button>
          ))}
        </div>

        {/* Route result */}
        {lastRoute && (
          <motion.div
            key={lastRoute.key + lastRoute.shardId}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-flow/30 bg-flow/5 px-4 py-3"
          >
            <p className="font-mono text-xs text-muted">Last route</p>
            <p className="mt-1 font-mono text-sm text-flow">{lastRoute.rule}</p>
          </motion.div>
        )}
      </SoftCard>

      {/* Shard columns */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shards.map((s) => (
          <ShardColumn
            key={s.id}
            name={s.name}
            keys={s.keys}
            highlighted={lastRoute?.shardId === s.id}
          />
        ))}
      </div>

      {/* Reset */}
      <div className="flex justify-end">
        <button
          onClick={() => fire({ type: "reset" })}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden />
          Reset
        </button>
      </div>

      <TelemetryLog entries={log} label="Sharding Log" />
    </div>
  );
}
