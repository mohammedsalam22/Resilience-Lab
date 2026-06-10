@AGENTS.md

# CLAUDE.md — Resilience Lab conventions

Always-on rules for this repo. Full feature specs, the REAL-vs-MODELED table, the theme
token tables, and the build order live in **`README.md`** (§0–§12). Read the relevant
README section before building a feature; this file is the durable how-we-work.

**Project:** a full-stack **Next.js (App Router, TypeScript)** app teaching Distributed
Systems (Load Balancing + Fault Tolerance) through live, server-driven simulations. The
server is the system under study; the client is the control panel + real-time visualization.

---

## Golden rules (never break these)

1. **Resilience is REAL.** Circuit breaker, retry, timeout, fallback run on the server via
   **cockatiel** wrapping a real toggleable endpoint (`/api/downstream`). Never fake them
   with `setTimeout` math.
2. **Server owns all logic.** Client components only render state and POST intents. No
   business logic, no decisions, in components.
3. **No hardcoded colors or magic sizes.** Use the Tailwind theme tokens / CSS variables
   (§5) and the 8/12/16/24 spacing scale. Accent (clay) appears only on the primary action.
4. **Clean up streams & timers.** Close `EventSource` on unmount; clear `setInterval` on
   engine reset; SSE controllers unsubscribe on abort.
5. **Label REAL vs MODELED.** Every interactive screen shows a small `<RealModeledBadge>`
   matching README §0.
6. **Persistent runtime.** Stateful/stream route handlers set `export const runtime='nodejs'`
   and `export const dynamic='force-dynamic'`. The live demo runs on a persistent Node server
   (`next start` / Docker), not Vercel serverless.

---

## Architecture

Feature-first; deliberately **not** over-abstracted (no repositories/use-cases — it's
in-memory). Same separation as a clean Cubit app.

```
src/
  app/            layout, globals.css (theme), page.tsx (home hub),
                  <section>/<topic>/page.tsx (client pages),
                  api/<feature>/route.ts (intents) + api/<feature>/stream/route.ts (SSE),
                  api/downstream/route.ts (the REAL flaky dependency)
  server/         SERVER-ONLY engine (import 'server-only'):
                  engine/eventBus.ts, engine/<feature>.ts, lib/flakyService.ts
  lib/            types.ts (shared DTOs), sse.ts (SSE Response helper)
  components/ui/  SoftCard, StatChip, SegmentedControl, TelemetryLog, ThemeToggle, RealModeledBadge
  components/features/  one client visualization per feature
  hooks/          useEventStream.ts
```

**Data flow (every interactive feature):**
client POSTs intent → `/api/<feature>` route handler → server **engine singleton** mutates
state + runs real logic → `bus.emit('<feature>', snapshot)` → `/api/<feature>/stream` SSE
pushes it → client `useEventStream` re-renders. Shared types in `src/lib/types.ts`.

**Engine** = a single module-level instance per feature, `import 'server-only'` at the top,
never imported by a client component. State persists across requests (needs the persistent
runtime above).

---

## Conventions

- **Derive, don't store** anything computable (active connections from in-flight, pool
  count from node states, etc.).
- **Type everything.** Validate request bodies with **zod**; SSE payloads are typed DTOs.
- **One feature = one trio:** `server/engine/<feature>.ts` + `app/api/<feature>/(route|stream)`
  + `components/features/<Feature>.tsx` (+ its page).
- **Tests:** keep the decision logic as **pure functions** (the WRR picker, the health-poll
  reducer, the sharding router) and unit-test them with **vitest**. Cover the key transitions
  for every Tier-1 feature.
- **Intents are explicit messages**, e.g. `POST /api/load-balancer { type:'setAlgorithm', algo:'p2c' }`.
  Add a zod schema per feature's intent union.

---

## Theme (tokens — never hardcode)

CSS variables in `globals.css`, mapped to Tailwind colors: `page, card, border, text, muted,
accent, onAccent, healthy, warning, danger, flow, track`. Two palettes via `.dark` on `<html>`
(toggle persisted in `localStorage`). Semantic colors are **desaturated** (sage/ochre/
terracotta), never neon. Dark background is warm charcoal, never pure black.

- Fonts via `next/font/google`: **Fraunces** (display), **Hanken Grotesk** (UI/body),
  **JetBrains Mono** (telemetry/numbers).
- `SoftCard` = `bg-card rounded-2xl border border-border`, soft shadow **light mode only**.
- `StatChip` = big mono number in a semantic color + muted label.
- Max content width ~760px, centered. Motion via framer-motion, subtle, respects
  `prefers-reduced-motion`. Visible focus rings; keyboard accessible.

Exact hex values: see README §5 tables.

---

## Per-feature workflow (follow every time)

Build **one feature end-to-end**, in README §11 order:
1. `server/engine/<feature>.ts` — logic (+ cockatiel for resilience features).
2. vitest for the pure decision functions / key transitions.
3. `app/api/<feature>/route.ts` (intents, zod-validated) + `app/api/<feature>/stream/route.ts` (SSE).
4. `components/features/<Feature>.tsx` + the page, consuming `useEventStream`.
5. Run `npx vitest` and `npm run lint`; fix before the next feature.

**Definition of done (per feature):** interactive, REAL/MODELED badge present, no hardcoded
colors, SSE/timers cleaned up, types shared via `lib/types.ts`, vitest green, lint clean,
works under `next build && next start`.

---

## Commands
```bash
npm run dev                 # http://localhost:3000 (development)
npm run build && npm start  # persistent server — required for live simulators (§3)
npm run lint                # next lint
npx vitest                  # engine unit tests
docker compose up --build   # optional REAL multi-node cluster (README §9)
```

---

## Don't
- Don't put logic in client components or fake resilience with timers.
- Don't import `server/` from client components.
- Don't hardcode colors/sizes or use neon colors.
- Don't rely on Vercel serverless for stateful/streaming routes.
- Don't scaffold many features at once — one end-to-end, tested, then the next.
