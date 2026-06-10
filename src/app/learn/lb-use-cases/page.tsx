import type { Metadata } from "next";
import { SoftCard } from "@/components/ui/SoftCard";

export const metadata: Metadata = { title: "LB Use Cases + Algorithm Guide" };

// ── Top-6 use cases ───────────────────────────────────────────────────────────

const USE_CASES = [
  {
    title: "1. High-availability web tier",
    scenario: "Multiple identical web servers behind one IP.",
    why: "Any server can fail without downtime; the LB reroutes in-flight requests.",
    algorithm: "Round-Robin or Weighted RR",
    note: "Weighted helps when servers have different capacities.",
  },
  {
    title: "2. Session-sensitive applications",
    scenario: "Shopping carts, dashboards where server-side sessions are stored locally.",
    why: "The same client must always land on the same server to avoid losing state.",
    algorithm: "Sticky (IP-hash or cookie-based)",
    note: "Move sessions to Redis to unlock stateless balancing.",
  },
  {
    title: "3. Heterogeneous server pool",
    scenario: "Some nodes are 32-core machines, others are 4-core.",
    why: "Sending equal traffic to unequal hardware wastes capacity.",
    algorithm: "Weighted Round-Robin",
    note: "Weight = rough CPU multiple (e.g. 8 vs 2).",
  },
  {
    title: "4. Long-lived / slow requests",
    scenario: "Video transcoding, ML inference, file uploads.",
    why: "RR queues jobs on a slow node while idle nodes wait; LC routes to whoever finishes first.",
    algorithm: "Least Connections or Least Response Time",
    note: "Power of Two Choices gives near-optimal LC with lower coordination cost.",
  },
  {
    title: "5. Microservices API gateway",
    scenario: "Many small services each with 3–10 replicas behind a mesh.",
    why: "P2C is O(log log n) optimal and scales to thousands of backends without locking.",
    algorithm: "Power of Two Choices (P2C)",
    note: "Used by Nginx, HAProxy, and Envoy at scale.",
  },
  {
    title: "6. Data-locality / sharded databases",
    scenario: "Each DB node owns a keyspace shard; requests must reach the right owner.",
    why: "Consistent hashing maps a key to a node and minimises remapping when nodes join/leave.",
    algorithm: "Consistent Hashing",
    note: "Cassandra, DynamoDB, and Redis Cluster all use this.",
  },
];

// ── Algorithm comparison table ────────────────────────────────────────────────

const ALGORITHMS = [
  { name: "Round-Robin",          tier: "1", complexity: "O(1)",          stickyness: "None",   bestFor: "Stateless, equal-capacity nodes",          weakness: "Ignores current load" },
  { name: "Weighted RR",          tier: "1", complexity: "O(n)",          stickyness: "None",   bestFor: "Mixed-capacity pools",                     weakness: "Static weights don't react to runtime load" },
  { name: "Least Connections",    tier: "1", complexity: "O(n)",          stickyness: "None",   bestFor: "Long-lived or variable-duration requests",  weakness: "Shared counter needs coordination" },
  { name: "Power of Two (P2C)",   tier: "1", complexity: "O(1)",          stickyness: "None",   bestFor: "Large pools, low overhead",                 weakness: "Slightly suboptimal vs full LC scan" },
  { name: "Sticky / IP-hash",     tier: "2", complexity: "O(1)",          stickyness: "Strong", bestFor: "Session-local state",                       weakness: "Uneven load; fails if node removed" },
  { name: "Least Response Time",  tier: "2", complexity: "O(n)",          stickyness: "None",   bestFor: "Requests with predictable duration",        weakness: "Requires real-time timing data" },
  { name: "Join Idle Queue (JIQ)", tier: "2", complexity: "O(n)",         stickyness: "None",   bestFor: "Bursty workloads with idle windows",        weakness: "Degrades to LC under sustained load" },
  { name: "Adaptive",             tier: "2", complexity: "O(n)",          stickyness: "None",   bestFor: "Mixed workloads that change over time",     weakness: "Slow to react to sudden spikes" },
  { name: "Consistent Hashing",   tier: "2", complexity: "O(log n) ring", stickyness: "Key",    bestFor: "Sharded data, cache locality",              weakness: "Hot spots if key distribution is skewed" },
];

export default function LBUseCasesPage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Reference</p>
        <h1 className="font-display text-3xl tracking-tight">LB Use Cases + Algorithm Guide</h1>
        <p className="max-w-xl text-muted">
          When to use a load balancer, which algorithm fits each scenario, and
          what each algorithm costs.
        </p>
      </section>

      {/* Use cases */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Top-6 use cases</h2>
        <div className="flex flex-col gap-3">
          {USE_CASES.map((uc) => (
            <SoftCard key={uc.title} className="flex flex-col gap-2 p-5">
              <h3 className="font-semibold text-text">{uc.title}</h3>
              <p className="text-sm text-muted">{uc.scenario}</p>
              <p className="text-sm text-text">{uc.why}</p>
              <div className="flex flex-wrap gap-3 pt-1 font-mono text-xs">
                <span className="rounded-full border border-flow/40 px-2.5 py-0.5 text-flow">
                  {uc.algorithm}
                </span>
                <span className="text-muted">{uc.note}</span>
              </div>
            </SoftCard>
          ))}
        </div>
      </section>

      {/* Algorithm comparison table */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Algorithm comparison</h2>
        <SoftCard className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <caption className="sr-only">Load-balancing algorithms compared by tier, complexity, stickiness, best fit, and weakness.</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted">Algorithm</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Tier</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Complexity</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Stickiness</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Best for</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Weakness</th>
              </tr>
            </thead>
            <tbody>
              {ALGORITHMS.map((a) => (
                <tr key={a.name} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-text">{a.name}</td>
                  <td className="px-4 py-2.5 font-mono text-muted">{a.tier}</td>
                  <td className="px-4 py-2.5 font-mono text-muted">{a.complexity}</td>
                  <td className="px-4 py-2.5 text-muted">{a.stickyness}</td>
                  <td className="px-4 py-2.5 text-muted">{a.bestFor}</td>
                  <td className="px-4 py-2.5 text-muted">{a.weakness}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SoftCard>
      </section>
    </div>
  );
}
