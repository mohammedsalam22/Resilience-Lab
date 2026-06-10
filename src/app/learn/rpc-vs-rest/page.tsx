import type { Metadata } from "next";
import { SoftCard } from "@/components/ui/SoftCard";
import { RpcRestDemo } from "@/components/features/RpcRestDemo";

export const metadata: Metadata = { title: "RPC vs REST" };

const COMPARISON = [
  { aspect: "Mental model",    rest: "Resources (nouns)",              rpc: "Actions / procedures (verbs)" },
  { aspect: "HTTP verb",       rest: "GET / POST / PUT / DELETE",      rpc: "Usually POST for everything" },
  { aspect: "URL shape",       rest: "/users/42",                      rpc: "/UserService/GetUser" },
  { aspect: "Payload",         rest: "JSON resource + hypermedia links", rpc: "Flat envelope: method + params" },
  { aspect: "Schema contract", rest: "OpenAPI / loose by default",     rpc: "Strict .proto (gRPC) or schema" },
  { aspect: "Streaming",       rest: "SSE / WebSocket bolt-ons",       rpc: "Native bidirectional streaming (gRPC)" },
  { aspect: "Transport",       rest: "HTTP/1.1 or HTTP/2",             rpc: "HTTP/2 (gRPC), multiplexed" },
  { aspect: "Browser support", rest: "Native fetch/XHR",               rpc: "Needs gRPC-Web proxy or transcoding" },
  { aspect: "Best for",        rest: "Public APIs, CRUD, simple integrations", rpc: "Internal microservices, perf-critical paths" },
];

const GRPC_POINTS = [
  {
    title: "Protobuf binary encoding",
    body: "Messages are serialised to compact binary frames, not UTF-8 JSON. A 200-byte JSON object might be 50 bytes as Protobuf — 4× smaller on the wire.",
  },
  {
    title: "HTTP/2 multiplexing",
    body: "Many concurrent RPC streams share one TCP connection. HEAD-OF-LINE blocking that plagued HTTP/1.1 is gone; requests don't wait for each other.",
  },
  {
    title: "Strict .proto contracts",
    body: "Every field has a type, number, and optionality declared in a .proto file. The compiler generates client and server stubs in Go, Python, TypeScript, and more — no drift.",
  },
  {
    title: "Bidirectional streaming",
    body: "Client streaming, server streaming, and full duplex are first-class primitives. Building a live telemetry feed in gRPC is a one-liner; in REST it requires SSE or WebSocket hacks.",
  },
];

export default function RpcVsRestPage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Reference</p>
        <h1 className="font-display text-3xl tracking-tight">RPC vs REST</h1>
        <p className="max-w-xl text-muted">
          Two communication philosophies, one wire. Fire a real request to each
          style and see how the payload shape, verb, and contract differ.
        </p>
      </section>

      {/* Live demo — client component */}
      <RpcRestDemo />

      {/* Comparison table */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Side-by-side comparison</h2>
        <SoftCard className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <caption className="sr-only">REST versus RPC/gRPC compared across mental model, verbs, URLs, payloads, contracts, and more.</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted">Aspect</th>
                <th className="px-4 py-3 text-left font-medium text-healthy">REST</th>
                <th className="px-4 py-3 text-left font-medium text-flow">RPC / gRPC</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((r) => (
                <tr key={r.aspect} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-text">{r.aspect}</td>
                  <td className="px-4 py-2.5 text-muted">{r.rest}</td>
                  <td className="px-4 py-2.5 text-muted">{r.rpc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SoftCard>
      </section>

      {/* gRPC deep-dive */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Why gRPC is fast</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {GRPC_POINTS.map((p) => (
            <SoftCard key={p.title} className="flex flex-col gap-2 p-5">
              <h3 className="font-semibold text-text">{p.title}</h3>
              <p className="text-sm text-muted">{p.body}</p>
            </SoftCard>
          ))}
        </div>
      </section>

      {/* HTTP/2 vs HTTP/1.1 */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">HTTP/2 vs HTTP/1.1</h2>
        <SoftCard className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <caption className="sr-only">HTTP/2 versus HTTP/1.1 compared across multiplexing, header compression, framing, server push, and head-of-line blocking.</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted">Feature</th>
                <th className="px-4 py-3 text-left font-medium text-muted">HTTP/1.1</th>
                <th className="px-4 py-3 text-left font-medium text-flow">HTTP/2</th>
              </tr>
            </thead>
            <tbody>
              {[
                { f: "Multiplexing",       h1: "One request per connection (pipelining fragile)", h2: "Many streams on one TCP connection" },
                { f: "Header compression", h1: "Plain text, repeated every request",              h2: "HPACK compression, delta-encoded" },
                { f: "Framing",            h1: "Text stream, newline-delimited",                  h2: "Binary frames, typed (DATA / HEADERS / SETTINGS)" },
                { f: "Server push",        h1: "Not supported",                                   h2: "Server can proactively send resources" },
                { f: "HOL blocking",       h1: "Blocks behind slow response",                     h2: "Stream-level independent; still TCP HOL" },
              ].map((r) => (
                <tr key={r.f} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-text">{r.f}</td>
                  <td className="px-4 py-2.5 text-muted">{r.h1}</td>
                  <td className="px-4 py-2.5 text-muted">{r.h2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SoftCard>
      </section>
    </div>
  );
}
