import { describe, it, expect } from "vitest";
import {
  buildGapSeverityPrompt,
  parseGapSeverityResponse,
  isGroundedInInventory,
} from "@/ai/gap-severity";

const BASE_INPUT = {
  company: "Acme",
  role: "Senior Platform Engineer",
  jobDescription: "5+ years Kubernetes required.",
  gap: "5+ years Kubernetes experience",
  achievementsMarkdown: "## Infrastructure\n- Scaled AWS ECS/Fargate across 7 insurer integrations at ilumed (2022)\n- Ran CKAD study group 2024\n",
  strongMatches: ["AWS experience"],
  archetype: "platform-sre",
};

describe("buildGapSeverityPrompt", () => {
  it("includes the gap text verbatim", () => {
    const p = buildGapSeverityPrompt(BASE_INPUT);
    expect(p).toContain("5+ years Kubernetes experience");
  });

  it("includes the achievements inventory", () => {
    const p = buildGapSeverityPrompt(BASE_INPUT);
    expect(p).toContain("ECS/Fargate");
  });

  it("includes the archetype so Sonnet knows the framing", () => {
    const p = buildGapSeverityPrompt(BASE_INPUT);
    expect(p).toContain("platform-sre");
  });

  it("asks for strict JSON output", () => {
    const p = buildGapSeverityPrompt(BASE_INPUT);
    expect(p).toContain("STRICT JSON");
  });

  it("caps job description and achievements to protect token budget", () => {
    const huge = "X".repeat(50_000);
    const p = buildGapSeverityPrompt({
      ...BASE_INPUT,
      jobDescription: huge,
      achievementsMarkdown: huge,
    });
    expect(p.length).toBeLessThan(20_000);
  });

  it("forbids em dashes in the rubric", () => {
    const p = buildGapSeverityPrompt(BASE_INPUT);
    expect(p).toContain("No em dashes");
  });
});

describe("parseGapSeverityResponse", () => {
  const validResponse = JSON.stringify({
    severity: "high",
    mitigation: "Frame ECS/Fargate work as container orchestration at scale in summary.",
    cited_achievements: ["Scaled AWS ECS/Fargate across 7 insurer integrations"],
    no_mitigation_available: false,
  });

  it("parses a well-formed response", () => {
    const r = parseGapSeverityResponse(validResponse);
    expect(r.severity).toBe("high");
    expect(r.mitigation).toContain("ECS/Fargate");
  });

  it("strips ```json code fences", () => {
    const fenced = "```json\n" + validResponse + "\n```";
    const r = parseGapSeverityResponse(fenced);
    expect(r.severity).toBe("high");
  });

  it("rejects invalid severity", () => {
    const bad = JSON.stringify({ ...JSON.parse(validResponse), severity: "critical" });
    expect(() => parseGapSeverityResponse(bad)).toThrow(/invalid severity/);
  });

  it("rejects empty mitigation", () => {
    const bad = JSON.stringify({ ...JSON.parse(validResponse), mitigation: "" });
    expect(() => parseGapSeverityResponse(bad)).toThrow(/empty mitigation/);
  });

  it("rejects em dashes in mitigation", () => {
    const bad = JSON.stringify({
      ...JSON.parse(validResponse),
      mitigation: "Frame ECS \u2014 as container orchestration.",
    });
    expect(() => parseGapSeverityResponse(bad)).toThrow(/em dash/);
  });

  it("rejects non-array cited_achievements", () => {
    const bad = JSON.stringify({ ...JSON.parse(validResponse), cited_achievements: "one" });
    expect(() => parseGapSeverityResponse(bad)).toThrow(/array/);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseGapSeverityResponse("not json")).toThrow();
  });
});

describe("isGroundedInInventory", () => {
  const inventory = "Scaled AWS ECS/Fargate across 7 insurer integrations at ilumed.";

  it("returns true when citation is substring of inventory", () => {
    const r = {
      severity: "high" as const,
      mitigation: "x",
      cited_achievements: ["Scaled AWS ECS/Fargate across 7 insurer"],
      no_mitigation_available: false,
    };
    expect(isGroundedInInventory(r, inventory)).toBe(true);
  });

  it("returns false when citation is hallucinated", () => {
    const r = {
      severity: "high" as const,
      mitigation: "x",
      cited_achievements: ["Led Kubernetes migration at Google for 3 years"],
      no_mitigation_available: false,
    };
    expect(isGroundedInInventory(r, inventory)).toBe(false);
  });

  it("returns true when no_mitigation_available is set", () => {
    const r = {
      severity: "blocker" as const,
      mitigation: "No adjacent experience available.",
      cited_achievements: [],
      no_mitigation_available: true,
    };
    expect(isGroundedInInventory(r, inventory)).toBe(true);
  });

  it("returns false when cited_achievements is empty and not flagged unavailable", () => {
    const r = {
      severity: "medium" as const,
      mitigation: "Something.",
      cited_achievements: [],
      no_mitigation_available: false,
    };
    expect(isGroundedInInventory(r, inventory)).toBe(false);
  });

  it("rejects citations too short to verify", () => {
    const r = {
      severity: "high" as const,
      mitigation: "x",
      cited_achievements: ["AWS"],  // too short
      no_mitigation_available: false,
    };
    expect(isGroundedInInventory(r, inventory)).toBe(false);
  });
});
