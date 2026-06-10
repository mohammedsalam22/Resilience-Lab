import { describe, expect, it, vi } from "vitest";
import { bus } from "../eventBus";

describe("eventBus", () => {
  it("delivers payloads to every subscriber on the channel", () => {
    const first = vi.fn();
    const second = vi.fn();
    bus.on("delivery", first);
    bus.on("delivery", second);

    bus.emit("delivery", { value: 1 });

    expect(first).toHaveBeenCalledWith({ value: 1 });
    expect(second).toHaveBeenCalledWith({ value: 1 });
  });

  it("stops delivering after the returned unsubscribe runs", () => {
    const listener = vi.fn();
    const unsubscribe = bus.on("unsubscribe", listener);

    bus.emit("unsubscribe", "before");
    unsubscribe();
    bus.emit("unsubscribe", "after");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("before");
  });

  it("keeps channels isolated from each other", () => {
    const listener = vi.fn();
    bus.on("channel-a", listener);

    bus.emit("channel-b", "noise");

    expect(listener).not.toHaveBeenCalled();
  });

  it("emitting on a channel with no subscribers is a no-op", () => {
    expect(() => bus.emit("silent", "nobody listening")).not.toThrow();
  });
});
