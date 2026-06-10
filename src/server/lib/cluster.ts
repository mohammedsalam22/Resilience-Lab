import "server-only";

// ── Real multi-node cluster wiring (README §9) ────────────────────────────────
//
// The single place that knows whether we're running as a real Docker cluster and
// how to reach the worker containers. Everything here is gated by USE_REAL_CLUSTER;
// when the flag is OFF, none of it is touched and the engines stay fully in-process.
//
// `parseWorkers` is a PURE function (unit-tested in src/test/cluster.test.ts). The
// fetch helpers below are the genuine network side-effects the engines call.

export interface WorkerEndpoint {
  /** Stable id derived from the name, e.g. "a". */
  id: string;
  /** Display name, e.g. "A". */
  name: string;
  /** Routing weight for Weighted RR. */
  weight: number;
  /** Base URL of the worker container, e.g. "http://worker-a:4000". */
  url: string;
}

/**
 * Parse the WORKERS env var into endpoints. Each entry is `NAME|WEIGHT|URL`
 * (comma-separated), e.g. `A|4|http://worker-a:4000,B|2|http://worker-b:4000`.
 * A bare `URL` is also tolerated: the name is derived from the hostname
 * (`worker-a` → `A`) and the weight defaults to 1.
 *
 * Pure: no env, no I/O — safe to unit-test.
 */
export function parseWorkers(raw: string | undefined | null): WorkerEndpoint[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => parseEntry(entry, i))
    .filter((e): e is WorkerEndpoint => e !== null);
}

function parseEntry(entry: string, index: number): WorkerEndpoint | null {
  const parts = entry.split("|").map((p) => p.trim());

  if (parts.length === 3) {
    const [name, weightStr, rawUrl] = parts;
    const url = stripTrailingSlash(rawUrl);
    if (!name || !url) return null;
    const weight = Number.parseInt(weightStr, 10);
    return {
      id: name.toLowerCase(),
      name,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      url,
    };
  }

  // Bare URL fallback — derive identity from the hostname.
  const url = stripTrailingSlash(entry);
  if (!url) return null;
  const host = safeHostname(url) ?? `worker-${index + 1}`;
  const tag = host.split("-").pop() || String(index + 1);
  const name = tag.toUpperCase();
  return { id: name.toLowerCase(), name, weight: 1, url };
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// ── Env-backed accessors ──────────────────────────────────────────────────────

/** True when the app is wired to real worker containers (set in docker-compose). */
export function isRealCluster(): boolean {
  return process.env.USE_REAL_CLUSTER === "true";
}

/** Endpoints parsed from the WORKERS env var (empty when unset). */
export function clusterEndpoints(): WorkerEndpoint[] {
  return parseWorkers(process.env.WORKERS);
}

// ── Real network calls to a worker container ──────────────────────────────────

const PROBE_TIMEOUT_MS = 1000;
const WORK_TIMEOUT_MS = 8000;
const ADMIN_TIMEOUT_MS = 2000;

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/** GET /health — true when the worker answers 200 (drives heartbeat + pool membership). */
export async function probeHealth(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${url}/health`, { method: "GET" }, PROBE_TIMEOUT_MS);
    return res.ok;
  } catch {
    return false;
  }
}

export interface WorkResult {
  ok: boolean;
  /** Real round-trip latency in ms (reflects the worker's slow mode). */
  ms: number;
}

/** GET /work — does real work on the container; ok=false when down/unreachable. */
export async function callWork(url: string): Promise<WorkResult> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(`${url}/work`, { method: "GET" }, WORK_TIMEOUT_MS);
    return { ok: res.ok, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

/** POST /admin — flip a worker's real slow/down mode. Returns true on success. */
export async function adminWorker(
  url: string,
  body: { slow?: boolean; down?: boolean },
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${url}/admin`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      ADMIN_TIMEOUT_MS,
    );
    return res.ok;
  } catch {
    return false;
  }
}
