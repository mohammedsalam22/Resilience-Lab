export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sseResponse } from "@/lib/sse";
import { bus } from "@/server/engine/eventBus";
import { breakerEngine } from "@/server/engine/circuitBreaker";

export function GET() {
  return sseResponse((send) => {
    // Send current snapshot immediately on connect.
    send(breakerEngine.snapshot());
    return bus.on("circuit-breaker", send);
  });
}
