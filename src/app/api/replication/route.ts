export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { replicationEngine } from "@/server/engine/replication";

const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setMode"), mode: z.enum(["active", "passive"]) }),
  z.object({ type: z.literal("sendCommand"), command: z.string().min(1).max(64) }),
  z.object({ type: z.literal("killReplica"), id: z.string() }),
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
    case "setMode": replicationEngine.setMode(intent.mode); break;
    case "sendCommand": replicationEngine.sendCommand(intent.command); break;
    case "killReplica": replicationEngine.killReplica(intent.id); break;
    case "reset": replicationEngine.reset(); break;
  }

  return Response.json(replicationEngine.snapshot());
}
