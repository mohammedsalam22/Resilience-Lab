export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import {
  hashRingEngine,
  MAX_REPLICAS,
  MIN_REPLICAS,
} from "@/server/engine/consistentHashing";

const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addNode") }),
  z.object({ type: z.literal("removeNode"), id: z.string() }),
  z.object({ type: z.literal("addKey"), label: z.string().min(1).max(32) }),
  z.object({
    type: z.literal("setReplicas"),
    n: z.number().int().min(MIN_REPLICAS).max(MAX_REPLICAS),
  }),
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
    case "addNode": hashRingEngine.addNode(); break;
    case "removeNode": hashRingEngine.removeNode(intent.id); break;
    case "addKey": hashRingEngine.addKey(intent.label); break;
    case "setReplicas": hashRingEngine.setReplicas(intent.n); break;
    case "reset": hashRingEngine.reset(); break;
  }

  return Response.json(hashRingEngine.snapshot());
}
