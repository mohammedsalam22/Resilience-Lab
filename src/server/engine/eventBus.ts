import "server-only";

export type BusListener = (data: unknown) => void;

const channels = new Map<string, Set<BusListener>>();

/** Tiny pub/sub feeding the SSE endpoints: one channel per feature. */
export const bus = {
  on(channel: string, listener: BusListener): () => void {
    let listeners = channels.get(channel);
    if (!listeners) {
      listeners = new Set();
      channels.set(channel, listeners);
    }
    listeners.add(listener);
    return () => bus.off(channel, listener);
  },

  off(channel: string, listener: BusListener): void {
    channels.get(channel)?.delete(listener);
  },

  emit(channel: string, data: unknown): void {
    channels.get(channel)?.forEach((listener) => listener(data));
  },
};
