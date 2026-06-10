export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sseResponse } from "@/lib/sse";
import { bus } from "@/server/engine/eventBus";
import { hashRingEngine } from "@/server/engine/consistentHashing";

export function GET() {
  return sseResponse((send) => {
    send(hashRingEngine.snapshot());
    return bus.on("consistent-hashing", send);
  });
}
