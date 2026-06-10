import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SoftCard } from "@/components/ui/SoftCard";

const sections = [
  {
    href: "/load-balancing",
    title: "Load Balancing",
    description:
      "A gateway routes live traffic across a worker pool. Compare round-robin, weighted, least connections, and power of two choices as workers slow down or drop out.",
    topics: ["Algorithms", "Health checks", "Consistent hashing"],
  },
  {
    href: "/fault-tolerance",
    title: "Fault Tolerance",
    description:
      "Break a real downstream service and watch circuit breakers, retries, and fallbacks absorb the damage — running genuinely on the server.",
    topics: ["Circuit breaker", "Retry + backoff", "Replication"],
  },
  {
    href: "/learn",
    title: "Learn",
    description:
      "Explainers, comparison tables, and a live REST vs RPC demo for the concepts behind the simulators.",
    topics: ["LB use cases", "gRPC vs REST", "Message passing", "Nginx"],
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Distributed systems, live
        </p>
        <h1 className="font-display text-4xl tracking-tight">
          The server is the lab.
        </h1>
        <p className="max-w-xl text-muted">
          Interactive simulations of load balancing and fault tolerance, driven
          by real server-side logic and streamed to this page as it happens.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="group rounded-2xl">
            <SoftCard className="flex h-full flex-col gap-3 p-6 transition-colors group-hover:border-muted">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl tracking-tight">
                  {section.title}
                </h2>
                <ArrowRight
                  aria-hidden
                  size={16}
                  className="text-muted transition-transform group-hover:translate-x-1"
                />
              </div>
              <p className="text-sm text-muted">{section.description}</p>
              <ul className="mt-auto flex flex-wrap gap-2 pt-2">
                {section.topics.map((topic) => (
                  <li
                    key={topic}
                    className="rounded-full bg-track px-2.5 py-0.5 text-xs text-muted"
                  >
                    {topic}
                  </li>
                ))}
              </ul>
            </SoftCard>
          </Link>
        ))}
      </section>
    </div>
  );
}
