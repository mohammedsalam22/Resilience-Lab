export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { fallbackEngine } from "@/server/engine/fallback";
import { setServiceHealthy } from "@/server/lib/flakyService";

const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sendRequest") }),
  z.object({ type: z.literal("setMode"), mode: z.enum(["withFallback", "noFallback"]) }),
  z.object({ type: z.literal("togglePrimary") }),
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
      await fallbackEngine.sendRequest();
      break;
    case "setMode":
      fallbackEngine.setMode(intent.mode);
      break;
    case "togglePrimary":
      setServiceHealthy(!fallbackEngine.getPrimaryHealthy());
      fallbackEngine.togglePrimary();
      break;
    case "reset":
      setServiceHealthy(true);
      fallbackEngine.reset();
      break;
  }

  return Response.json(fallbackEngine.snapshot());
}
