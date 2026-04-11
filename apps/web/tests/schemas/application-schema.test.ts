import { describe, it, expect } from "vitest";
import { updateApplicationSchema } from "../../src/schemas/application";

describe("updateApplicationSchema", () => {
  it("does not inject status default on partial updates", () => {
    const result = updateApplicationSchema.parse({ referral_status: "contacted" });
    expect(result.status).toBeUndefined();
  });

  it("preserves explicit status values", () => {
    const result = updateApplicationSchema.parse({ status: "applied" });
    expect(result.status).toBe("applied");
  });

  it("validates status enum values", () => {
    expect(() => updateApplicationSchema.parse({ status: "invalid_status" as never })).toThrow();
  });

  it("does not inject status on handleSave-style payloads", () => {
    const result = updateApplicationSchema.parse({
      notes: "some notes",
      contact: "Jane Doe",
      follow_up_date: "2026-04-15",
    });
    expect(result.status).toBeUndefined();
  });
});
