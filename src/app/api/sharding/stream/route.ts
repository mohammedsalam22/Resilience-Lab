export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sseResponse } from "@/lib/sse";
import { bus } from "@/server/engine/eventBus";
import { shardingEngine } from "@/server/engine/sharding";

export function GET() {
  return sseResponse((send) => {
    send(shardingEngine.snapshot());
    return bus.on("sharding", send);
  });
}
