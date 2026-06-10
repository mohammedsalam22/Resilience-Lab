import { describe, expect, it } from "vitest";
import { parseWorkers } from "@/server/lib/cluster";

describe("parseWorkers", () => {
  it("returns [] for missing / empty input", () => {
    expect(parseWorkers(undefined)).toEqual([]);
    expect(parseWorkers(null)).toEqual([]);
    expect(parseWorkers("")).toEqual([]);
    expect(parseWorkers("   ")).toEqual([]);
  });

  it("parses NAME|WEIGHT|URL entries", () => {
    const eps = parseWorkers(
      "A|4|http://worker-a:4000,B|2|http://worker-b:4000,C|1|http://worker-c:4000,D|3|http://worker-d:4000",
    );
    expect(eps).toEqual([
      { id: "a", name: "A", weight: 4, url: "http://worker-a:4000" },
      { id: "b", name: "B", weight: 2, url: "http://worker-b:4000" },
      { id: "c", name: "C", weight: 1, url: "http://worker-c:4000" },
      { id: "d", name: "D", weight: 3, url: "http://worker-d:4000" },
    ]);
  });

  it("trims whitespace and strips trailing slashes from URLs", () => {
    const eps = parseWorkers("  A|4|http://worker-a:4000/  ,  B|2|http://worker-b:4000 ");
    expect(eps[0].url).toBe("http://worker-a:4000");
    expect(eps[1].url).toBe("http://worker-b:4000");
  });

  it("defaults weight to 1 when missing or invalid", () => {
    const eps = parseWorkers("A|0|http://worker-a:4000,B|nope|http://worker-b:4000");
    expect(eps[0].weight).toBe(1);
    expect(eps[1].weight).toBe(1);
  });

  it("tolerates bare URLs, deriving name from the hostname", () => {
    const eps = parseWorkers("http://worker-a:4000,http://worker-b:4000");
    expect(eps).toEqual([
      { id: "a", name: "A", weight: 1, url: "http://worker-a:4000" },
      { id: "b", name: "B", weight: 1, url: "http://worker-b:4000" },
    ]);
  });

  it("skips malformed entries with no name or url", () => {
    const eps = parseWorkers("A|4|,|2|http://worker-x:4000,C|1|http://worker-c:4000");
    expect(eps).toEqual([{ id: "c", name: "C", weight: 1, url: "http://worker-c:4000" }]);
  });
});
