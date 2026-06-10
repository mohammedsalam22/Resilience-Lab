export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sseResponse } from "@/lib/sse";
import { bus } from "@/server/engine/eventBus";
import { healthEngine } from "@/server/engine/healthCheck";

export function GET() {
  return sseResponse((send) => {
    send(healthEngine.snapshot());
    return bus.on("health-check", send);
  });
}
