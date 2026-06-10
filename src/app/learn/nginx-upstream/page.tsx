import type { Metadata } from "next";
import { SoftCard } from "@/components/ui/SoftCard";

export const metadata: Metadata = { title: "Nginx upstream" };

// Each line is { code, annotation? } — annotation appears as a comment on hover.
const CONFIG_LINES: { code: string; annotation?: string; indent?: number }[] = [
  { code: "# /etc/nginx/conf.d/api.conf" },
  { code: "" },
  { code: "upstream api_pool {", annotation: "Names the pool — used in proxy_pass below." },
  { code: "    least_conn;", indent: 1, annotation: "Algorithm: Least Connections. Replace with 'ip_hash' for sticky sessions, or remove for Round-Robin (default)." },
  { code: "" },
  { code: "    server 10.0.0.1:3000 weight=4;", indent: 1, annotation: "Weight 4 — gets 4× more requests than a weight-1 server. Maps to Weighted RR." },
  { code: "    server 10.0.0.2:3000 weight=2;", indent: 1 },
  { code: "    server 10.0.0.3:3000 weight=1 backup;", indent: 1, annotation: "'backup' — only used when all primary servers are down or unavailable." },
  { code: "    server 10.0.0.4:3000 weight=3;" , indent: 1 },
  { code: "" },
  { code: "    keepalive 32;", indent: 1, annotation: "Keep up to 32 idle upstream connections alive. Avoids TCP handshake overhead on every request." },
  { code: "}" },
  { code: "" },
  { code: "upstream api_pool_hash {", annotation: "A second pool using consistent hashing — for session-affinity or cache-locality use cases." },
  { code: "    hash $request_uri consistent;", indent: 1, annotation: "'consistent' uses ketama consistent hashing. Removing it falls back to modulo hashing (rebalances all keys on pool change)." },
  { code: "    server 10.0.0.1:3000;" , indent: 1 },
  { code: "    server 10.0.0.2:3000;" , indent: 1 },
  { code: "}" },
  { code: "" },
  { code: "server {" },
  { code: "    listen 80;" , indent: 1 },
  { code: "    server_name api.example.com;", indent: 1 },
  { code: "" },
  { code: "    location /api/ {", indent: 1 },
  { code: "        proxy_pass http://api_pool;", indent: 2, annotation: "Route this location block to the upstream pool named 'api_pool'." },
  { code: "        proxy_http_version 1.1;", indent: 2, annotation: "Required for keepalive to work with upstream." },
  { code: "        proxy_set_header Connection \"\";", indent: 2 },
  { code: "        proxy_connect_timeout 2s;", indent: 2, annotation: "Fail-fast: give up trying to connect to a backend after 2 s." },
  { code: "        proxy_read_timeout 30s;", indent: 2 },
  { code: "" },
  { code: "        # Health check (Nginx Plus / ngx_upstream_check_module)", indent: 2 },
  { code: "        # health_check interval=5s fails=2 passes=1;", indent: 2, annotation: "Active health check: poll each backend every 5 s; mark unhealthy after 2 failures, healthy after 1 pass." },
  { code: "    }", indent: 1 },
  { code: "}" },
];

const DIRECTIVE_TABLE = [
  { directive: "least_conn",          effect: "Route to the server with fewest active connections." },
  { directive: "ip_hash",             effect: "Sticky: same client IP always hits the same server." },
  { directive: "hash $var consistent",effect: "Consistent hashing on $var (URI, cookie, header…). Minimal remapping when pool changes." },
  { directive: "weight=N",            effect: "Weighted Round-Robin. Higher N = proportionally more requests." },
  { directive: "backup",              effect: "Only used when all non-backup servers are down." },
  { directive: "max_fails=N",         effect: "Mark server unavailable after N consecutive failures." },
  { directive: "fail_timeout=Ns",     effect: "How long to keep a failed server out of rotation." },
  { directive: "keepalive N",         effect: "Cache N idle connections to backends (needs proxy_http_version 1.1)." },
  { directive: "health_check",        effect: "Active polling (Nginx Plus). Open-source: use ngx_upstream_check_module." },
];

export default function NginxUpstreamPage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Reference</p>
        <h1 className="font-display text-3xl tracking-tight">Nginx upstream</h1>
        <p className="max-w-xl text-muted">
          The directives that control how Nginx routes traffic to a backend pool —
          annotated line by line.
        </p>
      </section>

      {/* Annotated config */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Annotated configuration</h2>
        <SoftCard className="overflow-x-auto p-0">
          <div className="divide-y divide-border">
            {CONFIG_LINES.map((line, i) => (
              <div
                key={i}
                className={`group flex gap-4 px-4 py-1.5 ${line.annotation ? "hover:bg-track/40" : ""}`}
              >
                <span className="w-7 shrink-0 select-none text-right font-mono text-xs text-muted/40">
                  {i + 1}
                </span>
                <pre className={`flex-1 font-mono text-xs text-text ${line.indent === 2 ? "pl-8" : line.indent === 1 ? "pl-4" : ""}`}>
                  {line.code || " "}
                </pre>
                {line.annotation && (
                  <span className="hidden max-w-xs shrink-0 text-right text-xs text-flow group-hover:block">
                    ← {line.annotation}
                  </span>
                )}
              </div>
            ))}
          </div>
        </SoftCard>
        <p className="text-xs text-muted">Hover a line to see its annotation.</p>
      </section>

      {/* Directive reference */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Directive reference</h2>
        <SoftCard className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <caption className="sr-only">Nginx upstream directives and the effect each one has on routing.</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted">Directive</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Effect</th>
              </tr>
            </thead>
            <tbody>
              {DIRECTIVE_TABLE.map((d) => (
                <tr key={d.directive} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-flow">{d.directive}</td>
                  <td className="px-4 py-2.5 text-muted">{d.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SoftCard>
      </section>

      {/* Mapping to the simulator */}
      <SoftCard className="flex flex-col gap-3 p-5">
        <h2 className="font-display text-xl tracking-tight">Mapping to the simulator</h2>
        <p className="text-sm text-muted">
          Every algorithm you ran in the Load Balancer simulator maps directly to an
          Nginx directive:
        </p>
        <ul className="flex flex-col gap-1.5 pl-4 text-sm text-muted">
          <li className="list-disc"><strong className="text-text">Round-Robin</strong> — Nginx default (no directive needed)</li>
          <li className="list-disc"><strong className="text-text">Weighted RR</strong> — <code className="font-mono text-xs text-flow">weight=N</code> on each server</li>
          <li className="list-disc"><strong className="text-text">Least Connections</strong> — <code className="font-mono text-xs text-flow">least_conn</code></li>
          <li className="list-disc"><strong className="text-text">Sticky (IP-hash)</strong> — <code className="font-mono text-xs text-flow">ip_hash</code></li>
          <li className="list-disc"><strong className="text-text">Consistent Hashing</strong> — <code className="font-mono text-xs text-flow">hash $request_uri consistent</code></li>
          <li className="list-disc"><strong className="text-text">Health check</strong> — <code className="font-mono text-xs text-flow">max_fails</code> / <code className="font-mono text-xs text-flow">fail_timeout</code> (passive) or <code className="font-mono text-xs text-flow">health_check</code> (Plus)</li>
        </ul>
      </SoftCard>
    </div>
  );
}
