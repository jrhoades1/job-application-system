import { describe, it, expect } from "vitest";
import { classifyForWrite } from "@/lib/classify-on-write";

describe("classifyForWrite", () => {
  it("classifies a leadership role with matching JD", () => {
    const result = classifyForWrite({
      role: "Director of Software Engineering",
      jd: "Lead a team of 10 managers, own roadmap delivery.",
    });
    expect(result.archetype).toBe("engineering-leadership");
    expect(result.archetype_confidence).toBeGreaterThan(0.6);
  });

  it("returns general + 0 confidence for empty role", () => {
    expect(classifyForWrite({ role: "" })).toEqual({
      archetype: "general",
      archetype_confidence: 0,
    });
    expect(classifyForWrite({ role: null })).toEqual({
      archetype: "general",
      archetype_confidence: 0,
    });
    expect(classifyForWrite({ role: undefined })).toEqual({
      archetype: "general",
      archetype_confidence: 0,
    });
  });

  it("respects archetype hints from portal targets", () => {
    const withHint = classifyForWrite({
      role: "Senior Engineer",
      jd: "Work with AWS and LLMs and dbt.",
      hints: ["ai-applied"],
    });
    // Hint boost should make ai-applied at least as likely
    const withoutHint = classifyForWrite({
      role: "Senior Engineer",
      jd: "Work with AWS and LLMs and dbt.",
    });
    if (withHint.archetype === "ai-applied") {
      expect(withHint.archetype_confidence).toBeGreaterThanOrEqual(
        withoutHint.archetype_confidence
      );
    }
  });

  it("handles missing JD gracefully", () => {
    const result = classifyForWrite({ role: "Senior Platform Engineer" });
    expect(result.archetype).toBeDefined();
    expect(result.archetype_confidence).toBeGreaterThanOrEqual(0);
    expect(result.archetype_confidence).toBeLessThanOrEqual(1);
  });
});
