"use client";

import { useEffect, useRef } from "react";
import type { TelemetryEntry, TelemetryTone } from "@/lib/types";

const tones: Record<TelemetryTone, string> = {
  muted: "text-muted",
  healthy: "text-healthy",
  warning: "text-warning",
  danger: "text-danger",
  flow: "text-flow",
};

export function TelemetryLog({
  entries,
  label = "Telemetry",
}: {
  entries: TelemetryEntry[];
  label?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted">
        {label}
      </div>
      <div
        ref={scrollRef}
        role="log"
        aria-label={label}
        className="h-48 overflow-y-auto px-4 py-3 font-mono text-xs"
      >
        {entries.length === 0 ? (
          <p className="text-muted">Waiting for events…</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="shrink-0 text-muted">{entry.time}</span>
                <span className={entry.tone ? tones[entry.tone] : "text-text"}>
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
