export type SseSend = (data: unknown) => void;

/**
 * Builds a Server-Sent Events Response. `subscribe` receives a `send` function
 * and must return an unsubscribe callback, which runs when the client disconnects.
 */
export function sseResponse(
  subscribe: (send: SseSend) => () => void,
): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send: SseSend = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // enqueue throws once the client is gone; stop pushing to this stream.
          unsubscribe?.();
        }
      };
      unsubscribe = subscribe(send);
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
