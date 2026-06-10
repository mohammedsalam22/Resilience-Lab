# PROMPTS.md — ready-to-paste prompts for Claude Code

Use these in order. Claude Code auto-reads `CLAUDE.md` and you have `README.md` in the repo,
so the prompts stay short and lean on those. **Run `npm run lint` and `npx vitest` after each
step; don't move on until both are green.**

---

## Milestone 1 — Foundation (do this first)

```
Set up the foundation for this project. Follow CLAUDE.md and README.md §4 (architecture) and
§5 (theme). Do ONLY the foundation — no feature engines yet.

1. Theme: in app/globals.css add the light + dark CSS variables from README §5 (page, card,
   border, text, muted, accent, onAccent, healthy, warning, danger, flow, track). Configure
   tailwind.config.ts darkMode:'class' and map those variables to Tailwind color names.
2. Fonts: wire Fraunces (display), Hanken Grotesk (body/UI), JetBrains Mono (mono) via
   next/font/google in app/layout.tsx, exposed as CSS variables on <body>.
3. Shared infra:
   - src/lib/types.ts (empty barrel for now; shared DTOs will land here)
   - src/lib/sse.ts (the sseResponse helper from README §4)
   - src/hooks/useEventStream.ts (the typed EventSource hook from README §4; cleans up on unmount)
   - src/server/engine/eventBus.ts (a tiny typed pub/sub: on/off/emit per feature channel)
4. UI components in src/components/ui: SoftCard, StatChip, SegmentedControl, TelemetryLog,
   ThemeToggle (flips .dark on <html>, persists in localStorage), RealModeledBadge
   (a small pill that takes "REAL" | "MODELED").
5. app/page.tsx: a home hub with two SoftCard section links — "Load Balancing" and
   "Fault Tolerance" — using the warm theme. Empty section pages are fine for now.

Constraints: no hardcoded colors (use the Tailwind tokens), accent only on the primary
action, support light + dark, respect prefers-reduced-motion. No feature logic yet.
Then run npm run lint and fix anything.
```

---

## Milestone 2 — Circuit Breaker (the template every feature copies; REAL)

```
Build the Circuit Breaker feature end-to-end per README §6.2 and the rules in CLAUDE.md.
This is REAL server-side resilience and the template for all later features.

1. src/server/lib/flakyService.ts: a callDownstream() that fetches /api/downstream; plus a
   server flag serviceHealthy. app/api/downstream/route.ts returns 200 when healthy else 500.
2. src/server/engine/circuitBreaker.ts (import 'server-only', module singleton): a cockatiel
   circuitBreaker(handleAll, { halfOpenAfter:5000, breaker:new ConsecutiveBreaker(3) }) wrapping
   callDownstream(). Track stats {passed,failed,rejected,trips}; map BrokenCircuitError->rejected,
   other error->failed, success->passed. Push state via onBreak/onReset/onHalfOpen and after each
   request through eventBus.emit('circuit-breaker', snapshot). Expose intents:
   sendRequest(), toggleService(), reset().
3. src/lib/types.ts: add BreakerState DTO (mode, stats, serviceHealthy, openedAt, log[]).
4. vitest: cover the key transitions (3 failures -> open; request while open -> rejected; a
   healthy probe in half-open -> closed). Keep any decision helpers pure.
5. app/api/circuit-breaker/route.ts: POST intents (zod-validated union). 
   app/api/circuit-breaker/stream/route.ts: SSE of BreakerState. Both with
   runtime='nodejs' and dynamic='force-dynamic'.
6. components/features/CircuitBreaker.tsx + its page under app/fault-tolerance/circuit-breaker:
   flow strip Client -> [breaker] -> Downstream (breaker node colored by mode, dashes flow only
   when passing); status card with state pill + failure dots / animated 5s cooldown bar /
   probe hint; controls Send request, Break/Heal service, Reset; four StatChips; TelemetryLog.
   Show a RealModeledBadge "REAL". Use useEventStream for live state.

Then run npx vitest and npm run lint; fix before stopping.
```

---

## Milestone 3 — Retry + Backoff (REAL)

```
Build Retry + Backoff per README §6.4, reusing /api/downstream and the same engine/SSE/client
pattern as the Circuit Breaker. Use cockatiel retry(handleAll,{maxAttempts:5, backoff:new
ExponentialBackoff()}); surface each attempt and its delay (1s,2s,4s,8s...). Add a "no backoff"
mode (fixed 200ms) for contrast, an optional jitter toggle, and a heal-service toggle. Client:
attempt timeline (growing bars), live countdown to next retry, attempt log. RealModeledBadge "REAL".
vitest the backoff schedule. Lint + test green before stopping.
```

---

## Milestone 4 — Load Balancer (the star; workers MODELED, Docker-ready)

```
Build the Load Balancer per README §6.1, same engine + SSE + client pattern as the Circuit
Breaker. Workers are MODELED in-process for now but structure the engine so the §9 Docker
upgrade can swap them for real worker URLs behind a USE_REAL_CLUSTER flag.

Engine: worker pool (4 workers, weights 4/2/1/3), in-flight list, procBase 1700ms / procSlow
5200ms, spawnInterval 550ms, overloadAt 5. Derive active connections from in-flight. Implement
roundRobin, weightedRoundRobin (cumulative-weight loop), leastConnections, powerOfTwoChoices as
PURE functions and vitest them. A server tick completes in-flight (doneAt<=now) and auto-spawns
when streaming. Intents: setAlgorithm, sendRequest, toggleSlow(id), toggleDown(id), toggleStream,
reset. Client: algorithm selector + blurb; 4 worker columns (bar=active/scale, color
healthy->warning->danger, flame at overload, DOWN overlay, weight badge, handled count, slow/down
toggles); Send request / Stream traffic / Reset; footer routed/dropped. RealModeledBadge "MODELED".
Verify the teaching moment: slow one worker -> Round-Robin overloads it -> Least Connections / P2C
drain it. Lint + test green before stopping.
```

---

## Reusable template — any remaining feature

```
Build the <FEATURE> feature per README §<N>, using the exact same architecture, theme, and rules
as the Circuit Breaker (CLAUDE.md): server-only engine singleton -> eventBus -> SSE; client only
renders + POSTs intents; no hardcoded colors; clean up streams/timers; show the correct
RealModeledBadge (<REAL|MODELED>); keep decision logic pure and vitest it. Then run npx vitest and
npm run lint and fix before stopping.
```

Remaining features and their README sections: Health Check + Heartbeat (§6.3), Data Sharding
(§6.5), Fallback (§6.6), Replication Active/Passive (§6.7), Consistent Hashing (§1 Tier-2),
and the `/learn` reference + REST/RPC demo (§6.8). Build order is README §11.

---

## Optional — REAL multi-node cluster

```
Add the optional Docker cluster from README §9 behind a USE_REAL_CLUSTER env flag. Create a tiny
Express worker (workers/server.js) with GET /work and GET /health (slow/down toggwith via env),
a Dockerfile for it, and a docker-compose.yml with the Next gateway + 3 worker containers. When
the flag is on, point the Load Balancer at real worker URLs and the Health monitor at real
/health, with no client changes. Keep single-process the default so npm run dev still works.
```

---

## Tips
- If Claude Code drifts, paste: "Re-check CLAUDE.md golden rules — resilience must be REAL via
  cockatiel, no hardcoded colors, server owns logic, clean up SSE/timers."
- Keep each session to one feature. Commit after each green milestone.
- Run the live simulators with `npm run build && npm start` (persistent Node), not `vercel dev`.
