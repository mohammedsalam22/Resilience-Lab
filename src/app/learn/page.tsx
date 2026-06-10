import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SoftCard } from "@/components/ui/SoftCard";

export const metadata: Metadata = { title: "Learn" };

const topics = [
  {
    href: "/learn/lb-use-cases",
    title: "LB Use Cases + Algorithm Guide",
    description:
      "Top-6 load-balancing use cases and a comparison table of every routing algorithm — when to use each and what trade-offs it carries.",
  },
  {
    href: "/learn/rpc-vs-rest",
    title: "RPC vs REST — live demo",
    description:
      "How REST and RPC-style calls differ in shape, headers, and payload. Fires a real request to each internal endpoint so you can compare them side-by-side.",
  },
  {
    href: "/learn/message-passing",
    title: "Message Passing",
    description:
      "Queues, brokers, async decoupling, pub/sub, and exactly-once semantics — the communication layer that connects distributed services.",
  },
  {
    href: "/learn/nginx-upstream",
    title: "Nginx upstream",
    description:
      "Annotated Nginx configuration showing upstream pools, health checks, and the directives that map to the algorithms you ran in the simulator.",
  },
];

export default function LearnPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Reference</p>
        <h1 className="font-display text-3xl tracking-tight">Learn</h1>
        <p className="max-w-xl text-muted">
          Explainers, comparison tables, and live demos for the concepts behind
          the simulators.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        {topics.map((t) => (
          <Link key={t.href} href={t.href} className="group rounded-2xl">
            <SoftCard className="flex items-center justify-between gap-4 p-5 transition-colors group-hover:border-muted">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-xl tracking-tight">{t.title}</h2>
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
