export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sseResponse } from "@/lib/sse";
import { bus } from "@/server/engine/eventBus";
import { retryEngine } from "@/server/engine/retry";

export function GET() {
  return sseResponse((send) => {
    send(retryEngine.snapshot());
    return bus.on("retry", send);
  });
}
