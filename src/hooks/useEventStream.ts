"use client";

import { useEffect, useState } from "react";

/** Subscribes to an SSE endpoint and returns its latest typed payload. */
export function useEventStream<T>(url: string, initial: T): T {
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    const source = new EventSource(url);
    source.onmessage = (event) => {
      setState(JSON.parse(event.data) as T);
    };
    return () => source.close();
  }, [url]);

  return state;
}
