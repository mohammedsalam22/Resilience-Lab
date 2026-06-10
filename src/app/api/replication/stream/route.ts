export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sseResponse } from "@/lib/sse";
import { bus } from "@/server/engine/eventBus";
import { replicationEngine } from "@/server/engine/replication";

export function GET() {
  return sseResponse((send) => {
    send(replicationEngine.snapshot());
    return bus.on("replication", send);
  });
}
