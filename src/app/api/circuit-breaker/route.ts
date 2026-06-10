export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { breakerEngine } from "@/server/engine/circuitBreaker";
import { setServiceHealthy } from "@/server/lib/flakyService";

const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sendRequest") }),
  z.object({ type: z.literal("toggleService") }),
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
    case "sendRequest":
      await breakerEngine.sendRequest();
      break;
    case "toggleService":
      setServiceHealthy(!breakerEngine.getServiceHealthy());
      breakerEngine.toggleService();
      break;
    case "reset":
      breakerEngine.reset();
      break;
  }

  return Response.json(breakerEngine.snapshot());
}
