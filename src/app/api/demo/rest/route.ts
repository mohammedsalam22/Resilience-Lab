export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// REST-style endpoint: resource-oriented, JSON body with hypermedia links.
export async function GET() {
  const payload = {
    data: {
      id: "usr_42",
      type: "user",
      attributes: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        createdAt: new Date().toISOString(),
      },
      links: {
        self: "/api/users/42",
        orders: "/api/users/42/orders",
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
      "X-Demo-Style": "REST",
    },
  });
}
