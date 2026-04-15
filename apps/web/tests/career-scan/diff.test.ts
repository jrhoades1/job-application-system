import { describe, it, expect } from "vitest";
import { diffSnapshots } from "../../src/career-scan";
import type { JobListing } from "../../src/career-scan";

function listing(externalId: string, title = "Role"): JobListing {
  return { externalId, title, url: `https://example.com/${externalId}` };
}

describe("diffSnapshots", () => {
  it("classifies a brand new listing as new", () => {
    const result = diffSnapshots([listing("j1")], []);
    expect(result.new).toHaveLength(1);
    expect(result.stillPresent).toHaveLength(0);
    expect(result.removedIds).toHaveLength(0);
  });

  it("classifies an existing listing as still present", () => {
    const result = diffSnapshots(
      [listing("j1")],
      [{ id: "snap-1", job_external_id: "j1" }]
    );
    expect(result.new).toHaveLength(0);
    expect(result.stillPresent).toHaveLength(1);
    expect(result.stillPresent[0].snapshotId).toBe("snap-1");
    expect(result.removedIds).toHaveLength(0);
  });

  it("classifies a missing prior listing as removed", () => {
    const result = diffSnapshots(
      [],
      [{ id: "snap-1", job_external_id: "j1" }]
    );
    expect(result.removedIds).toEqual(["snap-1"]);
  });

  it("handles a mix of new, still present, and removed", () => {
    const fresh = [listing("j1"), listing("j2"), listing("j3")];
    const prior = [
      { id: "snap-1", job_external_id: "j1" },
      { id: "snap-2", job_external_id: "jOld" },
    ];
    const result = diffSnapshots(fresh, prior);
    expect(result.new.map((l) => l.externalId).sort()).toEqual(["j2", "j3"]);
    expect(result.stillPresent).toHaveLength(1);
    expect(result.stillPresent[0].snapshotId).toBe("snap-1");
    expect(result.removedIds).toEqual(["snap-2"]);
  });

  it("empty inputs produce empty diff", () => {
    const result = diffSnapshots([], []);
    expect(result.new).toHaveLength(0);
    expect(result.stillPresent).toHaveLength(0);
    expect(result.removedIds).toHaveLength(0);
  });

  it("duplicate fresh externalIds don't double-count still-present", () => {
    const fresh = [listing("j1"), listing("j1")];
    const prior = [{ id: "snap-1", job_external_id: "j1" }];
    const result = diffSnapshots(fresh, prior);
    expect(result.new).toHaveLength(0);
    expect(result.stillPresent).toHaveLength(2);
    expect(result.removedIds).toHaveLength(0);
  });
});
