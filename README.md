# Resilience Lab — Next.js Build Guide (client + server)

A full-stack **Next.js (App Router, TypeScript)** app that teaches **Distributed
Systems** from two lectures (Load Balancing + Fault Tolerance) with *live, server-driven*
simulations. The backend is the system under study; the frontend is the control panel +
real-time visualization. One language, one repo, one deploy.

This file is the single source of truth. Hand it to Claude Code and build feature by
feature in the order in §11.

> **Design thesis (unchanged from the original plan):** warm, editorial, Claude-like
> calm — ivory/charcoal surfaces, one clay accent, *desaturated* semantic colors — wrapped
> around a hard systems topic. The opposite of neon-on-black slideware.

---

## 0. The honest "real vs modeled" rule — read this first

A single backend process (any framework) cannot *be* multiple separate machines. So we
split every concept into two truthful categories and **label them in the UI and report**:

- **REAL (server-side):** logic that genuinely runs on the server — resilience policies
  wrapping a real flaky endpoint, the gateway's routing decision, health polling, sharding
  logic, RPC/REST calls.
- **MODELED (in-process):** anything that conceptually needs *separate nodes* — the worker
  pool, replicas, leader election. These are objects inside the one server process unless
  you enable the **Docker cluster upgrade (§9)**, which makes them genuinely separate
  containers.

| Feature | Default (one Next process) | With Docker cluster (§9) |
|---|---|---|
| Circuit Breaker | **REAL** — cockatiel wraps real `/api/downstream` | REAL |
| Retry + Backoff | **REAL** — cockatiel/p-retry vs real endpoint | REAL |
| Timeout & Fallback | **REAL** — cockatiel policies | REAL |
| API Gateway routing | **REAL** — decision made in a route handler | REAL |
| Load Balancer algorithms | REAL decision · **MODELED** workers (in-proc) | **REAL** workers (containers) |
| Health Check + Heartbeat | **MODELED** — pings in-process targets | **REAL** — pings worker `/health` |
| Data Sharding | REAL routing · **MODELED** shards (in-mem) | MODELED (still in-process — not part of the §9 cluster) |
| Active / Passive Replication | **MODELED** — replica objects | **REAL** — replica services |
| RPC vs REST | **REAL** REST + RPC-style calls | REAL |
| gRPC/Protobuf, HTTP/2, Nginx, Service Mesh, LB use-cases | **EXPLAINER** (reference pages) | EXPLAINER |

State this split in your demo/report verbatim — it reads as *deeper* understanding, not a
shortcut.

---

## 1. What the app must cover (mapped from the PDFs)

**Tier 1** = flagship interactive (build first) · **Tier 2** = interactive · **Tier 3** =
reference/explainer.

### Section A — Load Balancing (Session 05)
| Concept | Tier | Build as |
|---|---|---|
| LB algorithms: Round-Robin, Weighted RR, Least Connections, Power of Two Choices | 1 | One gateway + server farm; algorithm selector. Routing is **REAL**, workers **MODELED** (or REAL via Docker). |
| Sticky RR, Hash, Least Response Time, JIQ, Adaptive | 2 | Extra options in the same selector. |
| Health Monitoring / Heartbeat | 1 | Own simulator (shared with Section B). |
| Top-6 LB use cases | 3 | Explainer grid. |
| Consistent Hashing (ring) | 2 | Interactive ring: add/remove node, show remapped keys. |
| Service Mesh (Envoy/Istio sidecar) | 3 | Explainer. |
| Nginx `upstream` | 3 | Annotated snippet. |
| RPC, Message Passing, gRPC, Protobuf, HTTP/2 vs 1.1, REST vs RPC | 3 (RPC/REST demo = REAL) | Reference pages + one live REST-vs-RPC-style call demo. |

### Section B — Fault Tolerance (Session 06)
| Concept | Tier | Build as |
|---|---|---|
| Circuit Breaker (Closed/Open/Half-Open) | 1 | **REAL** cockatiel breaker over `/api/downstream`. |
| Retry + Backoff (exponential) | 1 | **REAL** cockatiel/p-retry; "no backoff" contrast mode. |
| Health Check + Heartbeat | 1 | Shared with Section A. |
| Fallback (graceful Plan B) | 2 | **REAL** cockatiel fallback. |
| Data Sharding (Hash/Range/Directory) | 2 | Key router; logic REAL, shards MODELED. |
| Active Replication (state-machine) | 2 | MODELED replicas; all process same ordered request. |
| Passive Replication (Leader–Follower) | 2 | MODELED primary + WAL + election. |
| Fault-tolerance overview + Active-vs-Passive table | 3 | Explainer + comparison. |

Coverage rule: app is "complete" when every Tier-1/2 item is interactive and every Tier-3
item exists as a clean explainer/comparison screen.

---

## 2. Tech stack & dependencies

- **Next.js (latest, App Router, TypeScript)**, React 18+.
- **Tailwind CSS** for styling (theme via CSS variables — §5).
- **cockatiel** — resilience policies (circuit breaker, retry, timeout, fallback, bulkhead).
  The TypeScript analog of .NET's Polly; it's the "real server-side" centerpiece.
- **Server-Sent Events (SSE)** for live server→client state (built into route handlers via
  `ReadableStream`; no extra dep). Optional `eventsource-parser` if you want a robust client parser.
- **framer-motion** (a.k.a. `motion`) for animations; **lucide-react** for icons.
- **zod** for validating request bodies (optional but tidy).
- **server-only** to keep the engine out of client bundles.
- Dev: **eslint**, **prettier**, **vitest** (+ `@vitest/ui`) for unit-testing the engine.

```bash
npx create-next-app@latest resilience-lab --ts --tailwind --app --eslint --src-dir
cd resilience-lab
npm i cockatiel framer-motion lucide-react zod server-only
npm i -D vitest @vitest/ui
```

---

## 3. Runtime & deployment — important

In-memory server state and long-lived SSE need a **persistent Node server**, not Vercel's
ephemeral serverless functions. So:

- Mark stateful/streaming route handlers with `export const runtime = 'nodejs'` and
  `export const dynamic = 'force-dynamic'`.
- For the demo, run a persistent process: `next start` (after `next build`), or containerize.
  Hosts that keep a long-running Node server: **Render, Railway, Fly.io**, a VPS, or Docker.
- On **Vercel**, serverless functions are stateless and time-limited → the in-memory engine
  resets and SSE gets cut. Fine for the marketing pages; **run the live simulators on a
  persistent host**. Say this in the report.

---

## 4. Architecture

**Server owns all logic; client renders state and fires intents.** Same discipline as a
clean Cubit app, expressed in Next.

### Folder layout
```
src/
  app/
    layout.tsx
    globals.css                         # theme CSS variables + Tailwind
    page.tsx                            # home hub (two section cards)
    load-balancing/[topic]/page.tsx     # client pages (control panels)
    fault-tolerance/[topic]/page.tsx
    api/
      downstream/route.ts               # REAL flaky endpoint resilience wraps
      circuit-breaker/route.ts          # POST intents (sendRequest, toggleService, reset)
      circuit-breaker/stream/route.ts   # GET SSE: live breaker state
      load-balancer/route.ts            # POST intents (algo, send, slow, down, stream)
      load-balancer/stream/route.ts     # GET SSE: server farm state
      health/route.ts
      health/stream/route.ts
      ...
  server/                               # SERVER-ONLY (import 'server-only')
    engine/
      eventBus.ts                       # tiny pub/sub feeding SSE
      circuitBreaker.ts                 # cockatiel policy + emitted state
      loadBalancer.ts                   # algorithms + worker-pool model
      health.ts
      retry.ts
      sharding.ts
      replication.ts
    lib/flakyService.ts                 # the toggleable failing dependency
  lib/
    types.ts                            # shared client+server TS types/DTOs
    sse.ts                              # helper to build an SSE Response
  components/
    ui/                                 # SoftCard, StatChip, SegmentedControl, TelemetryLog, ThemeToggle
    features/                           # one client visualization component per feature
  hooks/
    useEventStream.ts                   # subscribe to an SSE endpoint, return typed state
```

### Data flow (every interactive feature)
1. **Client control panel** POSTs an intent to `/api/<feature>` (e.g. `{ type: 'sendRequest' }`).
2. **Route handler** calls the server **engine** singleton, which mutates state and runs the
   real logic (cockatiel policy, routing decision, poll, …).
3. Engine **publishes** the new state on `eventBus`.
4. The feature's **SSE endpoint** (`/api/<feature>/stream`) pushes that state to every
   connected client.
5. **Client** (`useEventStream`) receives the typed state and re-renders the visualization.

### Engine pattern (server-only singleton)
```ts
// src/server/engine/circuitBreaker.ts
import 'server-only';
import { circuitBreaker, handleAll, ConsecutiveBreaker } from 'cockatiel';
import { bus } from './eventBus';
import { callDownstream } from '../lib/flakyService';

const breaker = circuitBreaker(handleAll, {
  halfOpenAfter: 5_000,
  breaker: new ConsecutiveBreaker(3),
});
const stats = { passed: 0, failed: 0, rejected: 0, trips: 0 };

breaker.onBreak(() => { stats.trips++; publish('open'); });
breaker.onReset(() => publish('closed'));
breaker.onHalfOpen(() => publish('halfOpen'));

export async function sendRequest() {
  try {
    await breaker.execute(() => callDownstream()); // REAL execution
    stats.passed++;
  } catch (e) {
    // cockatiel throws BrokenCircuitError while OPEN -> count as rejected vs failed
    if (isBrokenCircuit(e)) stats.rejected++; else stats.failed++;
  }
  publish();
}

function publish(/* ... */) { bus.emit('circuit-breaker', snapshot()); }
```
> Use a single module-level instance so state persists across requests (needs the
> persistent runtime from §3). Note this is genuinely the breaker executing — **REAL**.

### SSE helper
```ts
// src/lib/sse.ts
export function sseResponse(subscribe: (send: (data: unknown) => void) => () => void) {
  const stream = new ReadableStream({
    start(controller) {
      const send = (d: unknown) =>
        controller.enqueue(`data: ${JSON.stringify(d)}\n\n`);
      const unsubscribe = subscribe(send);
      // @ts-ignore - tie cleanup to cancel
      controller.signal?.addEventListener?.('abort', unsubscribe);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
```
Each `/api/<feature>/stream/route.ts`: `export const runtime='nodejs'`,
`export const dynamic='force-dynamic'`, then `return sseResponse(send => bus.on('<feature>', send))`.

### Client hook
```ts
// src/hooks/useEventStream.ts
export function useEventStream<T>(url: string, initial: T): T {
  const [state, setState] = useState(initial);
  useEffect(() => {
    const es = new EventSource(url);
    es.onmessage = (e) => setState(JSON.parse(e.data));
    return () => es.close();          // always clean up
  }, [url]);
  return state;
}
```

---

## 5. Theme & design system (same warm palette, as CSS variables)

Define tokens once in `globals.css`; map them to Tailwind; **never hardcode a color** in a
component — use the Tailwind classes / CSS vars.

```css
/* globals.css */
:root {
  --page-bg:#FAF9F5; --card-bg:#F0EEE6; --border:#E4E1D5;
  --text:#1F1E1C; --muted:#6E6B63; --accent:#D97757; --on-accent:#FBF7F2;
  --healthy:#6A9A78; --warning:#C9943F; --danger:#C2603E; --flow:#5B7FA6; --track:#E4E1D5;
}
.dark {
  --page-bg:#1B1A17; --card-bg:#262624; --border:#3A3833;
  --text:#ECEAE3; --muted:#A39E92; --accent:#E08A6B; --on-accent:#1B1A17;
  --healthy:#7FB58C; --warning:#D8A85A; --danger:#D17552; --flow:#7FA0C4; --track:#35332D;
}
body { background: var(--page-bg); color: var(--text); }
```

Tailwind theme extension (so you write `bg-card`, `text-muted`, `text-healthy`, …):
```ts
// tailwind.config.ts -> theme.extend.colors
colors: {
  page:'var(--page-bg)', card:'var(--card-bg)', border:'var(--border)',
  text:'var(--text)', muted:'var(--muted)', accent:'var(--accent)', onAccent:'var(--on-accent)',
  healthy:'var(--healthy)', warning:'var(--warning)', danger:'var(--danger)',
  flow:'var(--flow)', track:'var(--track)',
}
```
Dark mode: `darkMode:'class'`; a `ThemeToggle` flips `.dark` on `<html>` (persist in
`localStorage`).

| Token | Light | Dark | Use |
|---|---|---|---|
| page-bg | `#FAF9F5` | `#1B1A17` | page background (dark = warm charcoal, never black) |
| card-bg | `#F0EEE6` | `#262624` | panels |
| border | `#E4E1D5` | `#3A3833` | hairline borders |
| text | `#1F1E1C` | `#ECEAE3` | body text |
| muted | `#6E6B63` | `#A39E92` | secondary text |
| accent | `#D97757` | `#E08A6B` | **primary action only** (clay) |
| healthy | `#6A9A78` | `#7FB58C` | ok / closed / in-pool |
| warning | `#C9943F` | `#D8A85A` | half-open / warming |
| danger | `#C2603E` | `#D17552` | open / overload / failing |
| flow | `#5B7FA6` | `#7FA0C4` | in-motion / info |
| track | `#E4E1D5` | `#35332D` | empty bars / inactive lines |

**Typography** via `next/font/google`: **Fraunces** (display), **Hanken Grotesk** (UI/body),
**JetBrains Mono** (telemetry/numbers). Expose them as CSS variables on `<body>`.

**Component & motion rules:**
- `SoftCard`: `bg-card`, `rounded-2xl` (16px), `border border-border`, soft shadow **light
  mode only**. `StatChip`: big mono number in a semantic color + muted label.
- Spacing scale 8/12/16/24; max content width ~760px, centered (looks right on web).
- Accent (clay) appears **only** on the primary button.
- Motion: framer-motion for flowing connectors & transitions; keep it subtle; respect
  `prefers-reduced-motion`. Animate health/load with CSS/SVG.
- Full light + dark; visible focus rings; keyboard accessible.

---

## 6. Per-feature specs (server logic + client view)

Numbers/logic are identical to the conceptual model — restated here so this doc is standalone.

### 6.1 Load Balancer (Tier 1 — the star)
**Server (`loadBalancer.ts`):** worker pool `Worker{ id, name, weight, slow, down, handled }`
(default 4, weights 4/2/1/3); in-flight requests `{ workerId, doneAt }`. `procBase=1700ms`,
`procSlow=5200ms`, `spawnInterval=550ms` (when streaming), `overloadAt=5`. **Active
connections = derive from in-flight, never store.**

Algorithms (REAL decision on the server):
- **Round-Robin** — cycle healthy workers in order.
- **Weighted RR** — cumulative-weight loop: `total=Σweights; seq=counter%total;` walk
  cumulative, pick first where `seq < cumulative`; `counter++`.
- **Least Connections** — fewest active.
- **Power of Two Choices** — 2 random healthy, pick the less busy.
A `setInterval` tick (server) completes in-flight whose `doneAt<=now` and, when streaming,
spawns at `spawnInterval`. Each change → `bus.emit('load-balancer', snapshot)`.

**Teaching moment (must work):** stream + mark one worker `slow`. Round-Robin overloads it
(🔥 at active≥5); switch to Least Connections / P2C and it drains.

**Client:** algorithm selector + blurb; 4 worker columns (bar = active/scale, color
healthy→warning→danger, flame at overload, DOWN overlay, weight badge, handled count,
slow/down toggles → POST intents); `Send request`, `Stream traffic`, `Reset`; footer
`routed`/`dropped`. (Workers MODELED by default; **REAL** with §9.)

### 6.2 Circuit Breaker (Tier 1 — REAL, reference impl)
**Server:** one **cockatiel** `circuitBreaker(handleAll,{ halfOpenAfter:5000, breaker:new
ConsecutiveBreaker(3) })` wrapping `callDownstream()` → fetch to `/api/downstream`. A
`serviceHealthy` flag flips whether downstream returns 200 or 500. Map outcomes: success→
`passed`; `BrokenCircuitError`→`rejected` (fail fast); other error→`failed`; `onBreak`→
`trips`. Push state via `onBreak/onReset/onHalfOpen` + after each request.

Transition meaning (cockatiel handles the FSM): 3 consecutive failures → **open**; after
5s → **half-open** (next call probes); probe ok → **closed**, probe fails → **open**.

**Client:** flow strip `Client → [breaker] → Downstream` (breaker node colored by state,
dashes flow only when passing); status card with state pill + failure dots / **animated
cooldown bar** (5s) / probe hint; `Send request`, `Break/Heal service`, `Reset`; four
StatChips; telemetry log. **Tag: REAL.**

### 6.3 Health Check + Heartbeat (Tier 1, shared)
**Server (`health.ts`):** nodes `{ id,name,beating,missed,healthy,inPool }` (default 4).
Poll every `1s`, `missThreshold=2`: if `beating` → `missed=0, healthy, inPool`; else
`missed++`; at `missed>=2` → `unhealthy, out of pool`. Resume beating → recovers next poll.
Emit on transitions. (Targets MODELED by default; **REAL** `/health` pings with §9.)

**Client:** node cards with a pulsing heartbeat for beating nodes, status chip, silence/
resume toggles (POST), `healthy in pool: n/4`, telemetry. Note the LB tie-in: an unhealthy
node is exactly what leaves the balancer's pool.

### 6.4 Retry + Backoff (Tier 1 — REAL)
**Server (`retry.ts`):** cockatiel `retry(handleAll,{ maxAttempts:5, backoff:new
ExponentialBackoff() })` (or `p-retry`) against `/api/downstream`. Surface each attempt &
its delay (1s,2s,4s,8s…) to the client; offer a **"no backoff"** policy (fixed 200ms) for
contrast, optional jitter, and a heal-service toggle. **Client:** attempt timeline (growing
bars), live countdown to next retry, attempt log, jitter/heal toggles. **Tag: REAL.**

### 6.5 Data Sharding (Tier 2)
**Server (`sharding.ts`):** strategies **Hash** (`hash(key)%N`), **Range** (ID/letter
ranges), **Directory** (lookup table). Routing **REAL**; shard stores in-memory (**MODELED**).
**Client:** key input + strategy selector; animate route to the chosen shard, show the rule
(computed hash / matched range / lookup row). Notes: range→hotspots, hash→rebalancing pain,
directory→central failure.

### 6.6 Fallback (Tier 2 — REAL)
cockatiel `fallback(handleAll, () => planB())` over a failing primary; `fails` toggle.
Client: two-branch flow (Plan B succeeds vs hard failure in a "no fallback" mode) + log.

### 6.7 Replication — Active vs Passive (Tier 2 — MODELED)
**Server (`replication.ts`):** 3 replica objects. **Active:** every replica applies the same
ordered command; "kill" one → no client-visible downtime. **Passive:** only primary applies +
ships a WAL entry to backups; "kill" primary → election + promotion → brief failover.
**Client:** animate a command flowing + a node failure; include the comparison (processing,
failover time, consistency, cost). (**REAL** replica services with §9.)

### 6.8 Communication & reference (Tier 3 — `/learn`)
Explainer/comparison pages: LB Top-6 use cases; RPC stub/marshalling flow; Message Passing
(queue/broker, async, decoupling); gRPC vs REST (Protobuf, HTTP/2 multiplexing, strict
`.proto` contracts); algorithm comparison tables; Nginx `upstream`. **Plus one REAL demo:**
a page that fires a real REST call and an RPC-style call to internal routes and shows the
payload/shape difference.

---

## 7. Coding rules (enforce — graders notice)

1. **Server owns logic; client only renders + POSTs intents.** No business logic in components.
2. **Engine is server-only** (`import 'server-only'`), a module-level singleton, never imported
   by client components. DTOs/types shared via `src/lib/types.ts`.
3. **Resilience is real:** circuit breaker, retry, timeout, fallback go through **cockatiel**
   wrapping a real endpoint — do not fake them with `setTimeout` math.
4. **Derive, don't store** computed values (active connections from in-flight, etc.).
5. **Clean up streams & timers:** close `EventSource` on unmount; clear `setInterval` on engine
   reset; SSE controllers unsubscribe on abort.
6. **No hardcoded colors / magic sizes** — Tailwind tokens + CSS vars + the spacing scale.
7. **Typed everything** — request bodies validated with zod; SSE payloads strongly typed.
8. **Label REAL vs MODELED in the UI** (a small badge per screen) — matches §0.
9. **Test the engine** with vitest — pure functions (the WRR picker, the health poll reducer,
   the sharding router) unit-tested; at least the key transitions per Tier-1 feature.
10. **Accessibility & polish:** semantic HTML, focus rings, `prefers-reduced-motion`, responsive,
    light **and** dark.
11. **Runtime:** stateful/stream routes use `runtime='nodejs'` + `dynamic='force-dynamic'`; run
    on a persistent host for the demo (§3).

Example engine unit test:
```ts
// src/server/engine/__tests__/wrr.test.ts
import { describe, it, expect } from 'vitest';
import { pickWeighted } from '../loadBalancer';
it('weighted RR distributes ~4:2:1:3 over 10 picks', () => {
  const counts = countPicks(pickWeighted, 10);
  expect(counts).toMatchObject({ A: 4, B: 2, C: 1, D: 3 });
});
```

---

## 8. Acceptance checklist
- [ ] Light + dark, warm palette, accent only on primary actions; Fraunces/Hanken/JetBrains Mono.
- [ ] Home hub → two sections → topic pages.
- [ ] Tier-1 fully interactive: Load Balancer, Circuit Breaker, Health Check, Retry+Backoff.
- [ ] Resilience features are **REAL** via cockatiel over `/api/downstream`.
- [ ] Live state via SSE; client hook cleans up; engine state persists across requests on a Node server.
- [ ] Load Balancer slow-worker contrast works across all four algorithms.
- [ ] Tier-2 present: Sharding, Fallback, Replication, Consistent Hashing.
- [ ] Tier-3 present: LB use cases, RPC/MessagePassing/gRPC-vs-REST, comparison tables, + one REAL REST/RPC demo.
- [ ] Each screen shows a **REAL / MODELED** badge.
- [ ] `next lint` clean; `vitest` green.
- [ ] Runs with `next build && next start` (persistent), deploys to a Node host.

---

## 9. Optional upgrade — a REAL multi-node cluster via Docker  ✅ built

Turns the three MODELED items — **LB workers, health targets, replicas** — into genuinely
separate processes (containers) talking over a real network, removing the asterisk in §0.
**Same UI, zero client changes:** each screen's `REAL / MODELED` badge simply flips to **REAL**
because the server now reports `cluster: true` in its SSE snapshot.

Everything is gated behind a single **`USE_REAL_CLUSTER`** env flag that defaults **OFF**, so
`npm run dev` / `next start` behave exactly as before (in-process simulation). The flag is set
to `true` only inside `docker-compose.yml`.

### Pieces

- **Worker service** (`workers/server.js`) — a tiny **zero-dependency** Node `http` server, one
  per container:
  - `GET /work` — does a bit of work (sleeps `WORK_BASE_MS`, or `WORK_SLOW_MS` when slow);
    returns `503` when down.
  - `GET /health` — `200` while alive, `503` when down (drives the heartbeat monitor + pool).
  - `POST /admin { slow?, down? }` — flips this worker's real mode (this is what the UI
    "Slow"/"Down"/"Silence"/"Kill" buttons drive in cluster mode).
- **Gateway** = the Next app, built with `output: 'standalone'` (`Dockerfile`).
- **`docker-compose.yml`** — gateway (`:3000`) + four workers `worker-a/b/c/d` with weights
  **4 / 2 / 1 / 3** on a shared network. The gateway gets
  `WORKERS="A|4|http://worker-a:4000,…"` and `USE_REAL_CLUSTER=true`.

### What becomes REAL (and what's honestly still simplified)

- **Load Balancer** — the routing *decision* was always REAL; now the chosen worker is hit with
  a real `GET /work`, so **real latency** (incl. a worker put in "slow" mode) and a **stopped
  container** are reflected live. A `/health` reconcile loop drops/re-adds workers as containers
  stop/restart. The algorithm code is byte-for-byte identical to single-process mode.
- **Health Check** — really pings each worker's `GET /health` over the network; "Silence" takes
  that worker's health endpoint offline for real.
- **Replication** — replicas are **real separate processes**; "apply" is a real `/work`
  round-trip (a killed replica's container returns 503 and genuinely fails to apply); **"kill"
  is a real process crash** (the container stops answering) and **failover is real**.
  > **Honest scope:** this gives real processes, real crashes, and real failover, but the
  > passive-mode **WAL shipping and leader election are *simplified* and run in the gateway** —
  > they are **not** a production consensus protocol (no Raft/Paxos, no quorum, no split-brain
  > handling). The same caveat is stated in the engine source comments.

> **One real cluster, shared:** all three screens observe the **same** four worker containers.
> Downing/​killing a node on one page is genuinely visible on the others — that's the truth of a
> real cluster, not a bug.

### Run it

```bash
docker compose up --build          # gateway on http://localhost:3000 + 4 workers
# …explore the pages (below), then:
docker compose down                # stop everything
```

Open <http://localhost:3000> — every interactive screen now shows a green **REAL** badge:

- **Load Balancing → Load Balancer:** click **Stream traffic**; mark worker **A** *Slow* and on
  Round-Robin watch A overload (🔥) for real, then switch to **Least Conn / Power of 2** and see
  it drain. In another terminal run `docker compose stop worker-c` — C drops out of the pool
  within ~2s; `docker compose start worker-c` brings it back.
- **Fault Tolerance → Health Check:** **Silence** a node and watch its real `/health` start
  failing → 2 missed beats → out of pool; **Resume** to recover. `docker compose stop worker-b`
  does the same thing for real.
- **Fault Tolerance → Replication:** send a few commands (real `/work` round-trips bump `ops`),
  then **Kill** the primary in **Passive** mode → election → a backup is promoted; the killed
  replica's container is really stopped.

Single-process by default for ease of demo; the real multi-container cluster is one
`docker compose up --build` away.

---

## 10. Setup
```bash
npx create-next-app@latest resilience-lab --ts --tailwind --app --eslint --src-dir
cd resilience-lab
npm i cockatiel framer-motion lucide-react zod server-only
npm i -D vitest @vitest/ui
# drop this README at the repo root, set up the theme + fonts, then build per §11
npm run dev                  # http://localhost:3000
npm run build && npm start   # persistent server for the live simulators
npx vitest                   # engine tests
# optional real cluster:
docker compose up --build
```

---

## 11. Build order (milestones)
1. **Foundation:** Tailwind theme (CSS vars, dark class), fonts, `components/ui` (SoftCard,
   StatChip, SegmentedControl, TelemetryLog, ThemeToggle, RealModeledBadge), `lib/sse.ts`,
   `hooks/useEventStream.ts`, `server/engine/eventBus.ts`, home hub.
2. **Circuit Breaker** end-to-end (engine + cockatiel → `/api` intents + SSE → client view +
   vitest). This is the template every feature copies. **REAL.**
3. **Retry + Backoff** (REAL, reuses `/api/downstream`).
4. **Load Balancer** (star) — 4 algorithms + slow-worker contrast (workers MODELED).
5. **Health Check + Heartbeat.**
6. **Tier 2:** Sharding, Fallback, Replication, Consistent Hashing.
7. **Tier 3:** `/learn` reference + comparison pages + the REAL REST/RPC demo.
8. Polish: dark-mode pass, a11y, reduced-motion, REAL/MODELED badges, more engine tests.
9. **Optional §9 Docker cluster** to make LB/health/replication REAL.

---

## 12. Driving Claude Code with this file
- Build **one feature end-to-end at a time**, in §11 order. Don't scaffold everything at once.
- Per feature, request in this sequence: **engine (server logic + cockatiel) → vitest → `/api`
  route handlers (intents + SSE) → client component + page**, then `npx vitest` before moving on.
- After Milestone 1: *"Build the Circuit Breaker per §6.2 using cockatiel for a REAL breaker,
  with an SSE stream and the warm theme."* Then: *"Build the Load Balancer per §6.1, same engine
  + SSE + theme pattern as the Circuit Breaker; workers MODELED, structured for the §9 Docker
  upgrade."*
- Keep three rules always-on: **resilience is real (cockatiel, not fake timers)**, **no
  hardcoded colors (Tailwind tokens)**, **clean up SSE/timers**.
- Run `next lint` + `vitest` between features; fix before continuing.
