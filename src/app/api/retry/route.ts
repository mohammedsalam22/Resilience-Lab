export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { retryEngine } from "@/server/engine/retry";
import { setServiceHealthy } from "@/server/lib/flakyService";

const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run") }),
  z.object({ type: z.literal("setBackoffMode"), mode: z.enum(["expo", "fixed"]) }),
  z.object({ type: z.literal("setJitter"), jitter: z.boolean() }),
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
    case "run":
      // Fire-and-forget: the run streams progress over SSE and can take ~15s.
      void retryEngine.run();
      break;
    case "setBackoffMode":
      retryEngine.setBackoffMode(intent.mode);
      break;
    case "setJitter":
      retryEngine.setJitter(intent.jitter);
      break;
    case "toggleService":
      setServiceHealthy(!retryEngine.getServiceHealthy());
      retryEngine.toggleService();
      break;
    case "reset":
      retryEngine.reset();
      break;
  }

  return Response.json(retryEngine.snapshot());
}
