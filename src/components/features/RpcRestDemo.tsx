"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { SoftCard } from "@/components/ui/SoftCard";
import { RealModeledBadge } from "@/components/ui/RealModeledBadge";

interface CallResult {
  style: "REST" | "RPC";
  status: number;
  durationMs: number;
  method: string;
  url: string;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
}

async function fireRest(): Promise<CallResult> {
  const t0 = performance.now();
  const res = await fetch("/api/demo/rest", { cache: "no-store" });
  const durationMs = Math.round(performance.now() - t0);
  const body = await res.json();
  return {
    style: "REST",
    status: res.status,
    durationMs,
    method: "GET",
    url: "/api/demo/rest",
    requestBody: null,
    responseHeaders: { "content-type": res.headers.get("content-type") ?? "", "x-demo-style": res.headers.get("x-demo-style") ?? "" },
    responseBody: body,
  };
}

async function fireRpc(): Promise<CallResult> {
  const reqBody = { jsonrpc: "2.0", id: 1, method: "GetUser", params: { id: 42 } };
  const t0 = performance.now();
  const res = await fetch("/api/demo/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  const durationMs = Math.round(performance.now() - t0);
  const body = await res.json();
  return {
    style: "RPC",
    status: res.status,
    durationMs,
    method: "POST",
    url: "/api/demo/rpc",
    requestBody: JSON.stringify(reqBody, null, 2),
    responseHeaders: { "content-type": res.headers.get("content-type") ?? "", "x-demo-style": res.headers.get("x-demo-style") ?? "" },
    responseBody: body,
  };
}

function ResultPanel({ result }: { result: CallResult | null; }) {
  if (!result) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
        Fire the request to see the response
      </div>
    );
  }

  const isRest = result.style === "REST";

  return (
    <div className="flex flex-col gap-3">
      {/* Request line */}
      <div className="rounded-xl border border-border bg-page px-4 py-3">
        <p className="font-mono text-xs text-muted">Request</p>
        <p className="mt-1 font-mono text-sm text-text">
          <span className={isRest ? "text-healthy" : "text-flow"}>{result.method}</span>{" "}
          {result.url}
        </p>
        {result.requestBody && (
          <pre className="mt-2 overflow-x-auto text-xs text-muted">{result.requestBody}</pre>
        )}
      </div>

      {/* Response meta */}
      <div className="flex gap-3 font-mono text-xs">
        <span className="rounded-full bg-healthy/10 px-2.5 py-1 text-healthy">{result.status} OK</span>
        <span className="rounded-full bg-track px-2.5 py-1 text-muted">{result.durationMs} ms</span>
        <span className="rounded-full bg-track px-2.5 py-1 text-muted">{result.responseHeaders["x-demo-style"]}</span>
      </div>

      {/* Response body */}
      <div className="rounded-xl border border-border bg-page px-4 py-3">
        <p className="mb-2 font-mono text-xs text-muted">Response body</p>
        <pre className="overflow-x-auto font-mono text-xs text-text">
          {JSON.stringify(result.responseBody, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export function RpcRestDemo() {
  const [restResult, setRestResult] = useState<CallResult | null>(null);
  const [rpcResult,  setRpcResult]  = useState<CallResult | null>(null);
  const [loading, setLoading] = useState<"rest" | "rpc" | "both" | null>(null);

  const runBoth = async () => {
    setLoading("both");
    const [r, p] = await Promise.all([fireRest(), fireRpc()]);
    setRestResult(r);
    setRpcResult(p);
    setLoading(null);
  };

  const runRest = async () => {
    setLoading("rest");
    setRestResult(await fireRest());
    setLoading(null);
  };

  const runRpc = async () => {
    setLoading("rpc");
    setRpcResult(await fireRpc());
    setLoading(null);
  };

  return (
    <SoftCard className="flex flex-col gap-5 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg tracking-tight">Live demo</h2>
        <RealModeledBadge kind="REAL" />
      </div>

      <p className="text-sm text-muted">
        Both calls hit real internal routes on this server. Compare the shape,
        verb, and payload structure side-by-side.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={runBoth}
          disabled={loading !== null}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm text-onAccent disabled:opacity-50"
        >
          <Activity size={14} aria-hidden />
          Fire both
        </button>
        <button
          onClick={runRest}
          disabled={loading !== null}
          className="rounded-xl border border-healthy/40 px-4 py-2 text-sm text-healthy disabled:opacity-50"
        >
          REST only
        </button>
        <button
          onClick={runRpc}
          disabled={loading !== null}
          className="rounded-xl border border-flow/40 px-4 py-2 text-sm text-flow disabled:opacity-50"
        >
          RPC only
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-healthy">
            REST — GET /resource
          </p>
          <ResultPanel result={restResult} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-flow">
            RPC — POST /procedure
          </p>
          <ResultPanel result={rpcResult} />
        </div>
      </div>
    </SoftCard>
  );
}
