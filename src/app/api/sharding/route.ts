export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { shardingEngine } from "@/server/engine/sharding";

const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setStrategy"), strategy: z.enum(["hash", "range", "directory"]) }),
  z.object({ type: z.literal("route"), key: z.string().min(1).max(64) }),
  z.object({ type: z.literal("reset") }),
]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = IntentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const intent = parsed.data;
  switch (intent.type) {
    case "setStrategy": shardingEngine.setStrategy(intent.strategy); break;
    case "route": shardingEngine.route(intent.key); break;
    case "reset": shardingEngine.reset(); break;
  }

  return Response.json(shardingEngine.snapshot());
}
