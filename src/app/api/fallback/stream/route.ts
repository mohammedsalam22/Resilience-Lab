export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sseResponse } from "@/lib/sse";
import { bus } from "@/server/engine/eventBus";
import { fallbackEngine } from "@/server/engine/fallback";

export function GET() {
  return sseResponse((send) => {
    send(fallbackEngine.snapshot());
    return bus.on("fallback", send);
  });
}
