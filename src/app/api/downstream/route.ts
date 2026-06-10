export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isServiceHealthy } from "@/server/lib/flakyService";

export function GET() {
  if (isServiceHealthy()) {
    return Response.json({ ok: true });
  }
  return Response.json({ error: "downstream failure" }, { status: 500 });
}
