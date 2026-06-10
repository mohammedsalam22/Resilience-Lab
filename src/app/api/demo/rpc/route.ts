export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RPC-style endpoint: action-oriented, flat envelope, no hypermedia.
// Simulates the shape of a gRPC-transcoded JSON response or a JSON-RPC 2.0 call.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const req = body as Record<string, unknown>;
  const method = typeof req.method === "string" ? req.method : "GetUser";
  const params = typeof req.params === "object" && req.params !== null ? req.params : { id: 42 };

  const payload = {
    jsonrpc: "2.0",
    id: req.id ?? 1,
    result: {
      method,
      params,
      output: {
        userId: 42,
        fullName: "Ada Lovelace",
        emailAddress: "ada@example.com",
        createdTimestamp: Math.floor(Date.now() / 1000),
      },
    },
    meta: {
      requestId: crypto.randomUUID(),
      servedAt: new Date().toISOString(),
    },
  };

  return Response.json(payload, {
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Style": "RPC",
    },
  });
}
