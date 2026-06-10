export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { healthEngine } from "@/server/engine/healthCheck";

const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("silence"), id: z.string() }),
  z.object({ type: z.literal("resume"), id: z.string() }),
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
    case "silence":
      healthEngine.silence(intent.id);
      break;
    case "resume":
      healthEngine.resume(intent.id);
      break;
    case "reset":
      healthEngine.reset();
      break;
  }

  return Response.json(healthEngine.snapshot());
}
