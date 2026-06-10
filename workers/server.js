// Resilience Lab — worker service (README §9).
//
// A genuinely separate process the Next gateway talks to over the network. One of
// these runs per container (worker-a/b/c/d). It is deliberately tiny: plain Node
// `http`, ZERO dependencies, so its Docker image needs no `npm install`.
//
// Endpoints
//   GET  /work    — does a bit of work (sleeps), honoring "slow"; 503 when "down".
//   GET  /health  — 200 while alive, 503 when "down" (drives the heartbeat monitor).
//   POST /admin   — { slow?: boolean, down?: boolean } toggles this worker's mode.
//   GET  /        — identity { name, weight, slow, down }.
//
// "slow" and "down" are the REAL counterparts of the in-process toggles: flipping
// them here actually changes how this container answers across the network.

const http = require("node:http");

const NAME = process.env.NAME ?? "?";
const WEIGHT = Number.parseInt(process.env.WEIGHT ?? "1", 10) || 1;
const PORT = Number.parseInt(process.env.PORT ?? "4000", 10) || 4000;
const WORK_BASE_MS = Number.parseInt(process.env.WORK_BASE_MS ?? "1200", 10) || 1200;
const WORK_SLOW_MS = Number.parseInt(process.env.WORK_SLOW_MS ?? "5000", 10) || 5000;

// Per-worker runtime mode. The gateway flips these via POST /admin.
const state = { slow: false, down: false };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      // Guard against unbounded bodies.
      if (raw.length > 4096) req.destroy();
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null); // signal malformed JSON
      }
    });
    req.on("error", () => resolve(null));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // ── GET /work ───────────────────────────────────────────────────────────────
  if (req.method === "GET" && path === "/work") {
    if (state.down) {
      log(`/work refused (down)`);
      return sendJson(res, 503, { error: "down", name: NAME });
    }
    const ms = state.slow ? WORK_SLOW_MS : WORK_BASE_MS;
    await sleep(ms);
    log(`/work done in ${ms}ms${state.slow ? " (slow)" : ""}`);
    return sendJson(res, 200, { name: NAME, ms, slow: state.slow });
  }

  // ── GET /health ───────────────────────────────────────────────────────────────
  if (req.method === "GET" && path === "/health") {
    if (state.down) {
      return sendJson(res, 503, { status: "down", name: NAME });
    }
    return sendJson(res, 200, {
      status: "ok",
      name: NAME,
      weight: WEIGHT,
      slow: state.slow,
      down: state.down,
    });
  }

  // ── POST /admin ───────────────────────────────────────────────────────────────
  if (req.method === "POST" && path === "/admin") {
    const body = await readJson(req);
    if (body === null) return sendJson(res, 400, { error: "invalid JSON" });
    if (typeof body.slow === "boolean") state.slow = body.slow;
    if (typeof body.down === "boolean") state.down = body.down;
    log(`/admin → slow=${state.slow} down=${state.down}`);
    return sendJson(res, 200, { name: NAME, slow: state.slow, down: state.down });
  }

  // ── GET / (identity) ────────────────────────────────────────────────────────
  if (req.method === "GET" && (path === "/" || path === "")) {
    return sendJson(res, 200, {
      name: NAME,
      weight: WEIGHT,
      slow: state.slow,
      down: state.down,
    });
  }

  sendJson(res, 404, { error: "not found", path });
});

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[worker ${NAME}] ${msg}`);
}

server.listen(PORT, "0.0.0.0", () => {
  log(`listening on :${PORT} (weight ${WEIGHT}, base ${WORK_BASE_MS}ms, slow ${WORK_SLOW_MS}ms)`);
});

// Graceful shutdown so `docker stop` is a clean, fast process crash.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    log(`${sig} — shutting down`);
    server.close(() => process.exit(0));
  });
}
