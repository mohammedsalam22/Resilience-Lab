import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SoftCard } from "@/components/ui/SoftCard";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

export const metadata: Metadata = {
  title: "Fault Tolerance",
};

const topics = [
  {
    href: "/fault-tolerance/circuit-breaker",
    title: "Circuit Breaker",
    description: "3 failures open the breaker; a probe re-closes it after 5 s.",
    kind: "REAL" as const,
  },
  {
    href: "/fault-tolerance/retry",
    title: "Retry + Backoff",
    description: "Up to 5 attempts with exponential backoff (1/2/4/8 s) vs a flat 200 ms.",
    kind: "REAL" as const,
  },
  {
    href: "/fault-tolerance/health-check",
    title: "Health Check + Heartbeat",
    description: "Nodes send a heartbeat every second; 2 misses removes a node from the pool.",
    kind: "MODELED" as const,
  },
  {
    href: "/fault-tolerance/fallback",
    title: "Fallback",
    description: "cockatiel catches primary failure and serves a Plan B response — zero downtime. Disable to see hard failure.",
    kind: "REAL" as const,
  },
  {
    href: "/fault-tolerance/replication",
    title: "Replication",
    description: "Active: all replicas apply every command. Passive: primary + WAL to backups; kill primary to trigger election.",
    kind: "MODELED" as const,
  },
];

export default function FaultTolerancePage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Session 06
        </p>
        <h1 className="font-display text-3xl tracking-tight">Fault Tolerance</h1>
        <p className="max-w-xl text-muted">
          Circuit breakers, retries, and fallbacks wrapping a real flaky service.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {topics.map((t) => (
          <Link key={t.href} href={t.href} className="group rounded-2xl">
            <SoftCard className="flex items-center justify-between gap-4 p-5 transition-colors group-hover:border-muted">
              <div className="flex flex-col gap-1">
                <span className="font-display text-lg tracking-tight">{t.title}</span>
                <span className="text-sm text-muted">{t.description}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <RealModeledBadge kind={t.kind} />
                <ArrowRight size={14} className="text-muted transition-transform group-hover:translate-x-1" aria-hidden />
              </div>
            </SoftCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
