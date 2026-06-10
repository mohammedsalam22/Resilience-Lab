import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SoftCard } from "@/components/ui/SoftCard";
import type { RealOrModeled } from "@/lib/types";

export const metadata: Metadata = { title: "Load Balancing" };

const topics: { href: string; title: string; description: string; badge: RealOrModeled }[] = [
  {
    href: "/load-balancing/load-balancer",
    title: "Load Balancer",
    description:
      "Route live traffic across a 4-worker pool. Compare Round-Robin, Weighted, Least Connections, Power of Two, Sticky, LRT, JIQ, and Adaptive as workers slow down or go offline.",
    badge: "MODELED",
  },
  {
    href: "/load-balancing/sharding",
    title: "Data Sharding",
    description:
      "Route a key to one of 4 shards using Hash (hash%N), Range (letter ranges), or Directory (lookup table). See why each strategy creates different trade-offs.",
    badge: "MODELED",
  },
  {
    href: "/load-balancing/consistent-hashing",
    title: "Consistent Hashing",
    description:
      "Nodes and keys sit on a ring. Add or remove a node — only the affected keys remap, minimising disruption compared to hash%N rebalancing.",
    badge: "MODELED",
  },
];

export default function LoadBalancingPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Session 05
        </p>
        <h1 className="font-display text-3xl tracking-tight">Load Balancing</h1>
        <p className="max-w-xl text-muted">
          A gateway routes live traffic across a worker pool. Watch routing
          algorithms respond in real time as workers slow down or go offline.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        {topics.map((t) => (
          <Link key={t.href} href={t.href} className="group rounded-2xl">
            <SoftCard className="flex items-center justify-between gap-4 p-5 transition-colors group-hover:border-muted">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl tracking-tight">{t.title}</h2>
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
                      t.badge === "REAL"
                        ? "border-healthy/40 text-healthy"
                        : "border-flow/40 text-flow"
                    }`}
                  >
                    {t.badge}
                  </span>
                </div>
                <p className="text-sm text-muted">{t.description}</p>
              </div>
              <ArrowRight
                aria-hidden
                size={16}
                className="shrink-0 text-muted transition-transform group-hover:translate-x-1"
              />
            </SoftCard>
          </Link>
        ))}
      </section>
    </div>
  );
}
