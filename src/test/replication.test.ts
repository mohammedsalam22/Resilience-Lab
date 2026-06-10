import { describe, expect, it } from "vitest";
import {
  applyActiveCommand,
  applyPassiveCommand,
  electNewPrimary,
} from "@/server/engine/replication";
import type { Replica } from "@/lib/types";

function makeReplicas(): Replica[] {
  return [
    { id: "r0", name: "R0", role: "primary", alive: true, ops: 0, walEntries: 0 },
    { id: "r1", name: "R1", role: "backup",  alive: true, ops: 0, walEntries: 0 },
    { id: "r2", name: "R2", role: "backup",  alive: true, ops: 0, walEntries: 0 },
  ];
}

describe("applyActiveCommand", () => {
  it("increments ops on all alive replicas", () => {
    const result = applyActiveCommand(makeReplicas(), "SET x=1");
    expect(result.every((r) => r.ops === 1)).toBe(true);
  });

  it("skips dead replicas", () => {
    const replicas = makeReplicas().map((r, i) =>
      i === 1 ? { ...r, alive: false } : r,
    );
    const result = applyActiveCommand(replicas, "SET x=1");
    expect(result[0].ops).toBe(1);
    expect(result[1].ops).toBe(0); // dead
    expect(result[2].ops).toBe(1);
  });
});

describe("applyPassiveCommand", () => {
  it("increments ops only on the primary", () => {
    const result = applyPassiveCommand(makeReplicas(), "SET x=1");
    expect(result[0].ops).toBe(1); // primary
    expect(result[1].ops).toBe(0); // backup
    expect(result[2].ops).toBe(0); // backup
  });

  it("ships WAL entry to all alive replicas", () => {
    const result = applyPassiveCommand(makeReplicas(), "SET x=1");
    expect(result.every((r) => r.walEntries === 1)).toBe(true);
  });

  it("skips dead replicas entirely", () => {
    const replicas = makeReplicas().map((r, i) =>
      i === 2 ? { ...r, alive: false } : r,
    );
    const result = applyPassiveCommand(replicas, "SET x=1");
    expect(result[2].walEntries).toBe(0); // dead
  });
});

describe("electNewPrimary", () => {
  it("promotes the backup with the most WAL entries", () => {
    const replicas: Replica[] = [
      { id: "r0", name: "R0", role: "primary", alive: false, ops: 5, walEntries: 5 },
      { id: "r1", name: "R1", role: "backup",  alive: true,  ops: 0, walEntries: 3 },
      { id: "r2", name: "R2", role: "backup",  alive: true,  ops: 0, walEntries: 5 },
    ];
    const result = electNewPrimary(replicas);
    const newPrimary = result.find((r) => r.role === "primary" && r.alive);
    expect(newPrimary?.id).toBe("r2");
  });

  it("old primary is demoted to backup after election", () => {
    const replicas: Replica[] = [
      { id: "r0", name: "R0", role: "primary", alive: false, ops: 5, walEntries: 5 },
      { id: "r1", name: "R1", role: "backup",  alive: true,  ops: 0, walEntries: 2 },
      { id: "r2", name: "R2", role: "backup",  alive: true,  ops: 0, walEntries: 4 },
    ];
    const result = electNewPrimary(replicas);
    expect(result.find((r) => r.id === "r0")?.role).toBe("backup");
    expect(result.find((r) => r.id === "r2")?.role).toBe("primary");
  });

  it("no-op when there are no alive backups", () => {
    const replicas: Replica[] = [
      { id: "r0", name: "R0", role: "primary", alive: false, ops: 0, walEntries: 0 },
    ];
    const result = electNewPrimary(replicas);
    expect(result).toEqual(replicas);
  });
});
