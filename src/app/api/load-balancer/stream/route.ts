export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sseResponse } from "@/lib/sse";
import { bus } from "@/server/engine/eventBus";
import { lbEngine } from "@/server/engine/loadBalancer";

export function GET() {
  return sseResponse((send) => {
    send(lbEngine.snapshot());
    return bus.on("load-balancer", send);
  });
}
