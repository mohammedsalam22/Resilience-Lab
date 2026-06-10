export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { lbEngine } from "@/server/engine/loadBalancer";

const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setAlgorithm"), algo: z.enum(["rr", "wrr", "lc", "p2c", "sticky", "lrt", "jiq", "adaptive"]) }),
  z.object({ type: z.literal("sendRequest") }),
  z.object({ type: z.literal("toggleSlow"), id: z.string() }),
  z.object({ type: z.literal("toggleDown"), id: z.string() }),
  z.object({ type: z.literal("toggleStream") }),
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
    case "setAlgorithm":
      lbEngine.setAlgorithm(intent.algo);
      break;
    case "sendRequest":
      lbEngine.sendRequest();
      break;
    case "toggleSlow":
      lbEngine.toggleSlow(intent.id);
      break;
    case "toggleDown":
      lbEngine.toggleDown(intent.id);
      break;
    case "toggleStream":
      lbEngine.toggleStream();
      break;
    case "reset":
      lbEngine.reset();
      break;
  }

  return Response.json(lbEngine.snapshot());
}
