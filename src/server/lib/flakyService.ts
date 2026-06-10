import "server-only";

let serviceHealthy = true;

export function isServiceHealthy() {
  return serviceHealthy;
}

export function setServiceHealthy(healthy: boolean) {
  serviceHealthy = healthy;
}

/** Makes a real HTTP call to /api/downstream. Throws on 5xx. */
export async function callDownstream(): Promise<void> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/downstream`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Downstream ${res.status}`);
}
