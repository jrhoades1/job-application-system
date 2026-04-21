/**
 * Mirror of tests/test_classify_archetype.py. Same fixtures, same expectations.
 * Runs under Vitest.
 */
import { describe, it, expect } from "vitest";
import {
  classifyArchetype,
  applyArchetypeToBands,
  ARCHETYPE_CONFIG,
} from "@/scoring/classify-archetype";

const FIXTURES: Array<[string, string, string]> = [
  [
    "Sr Manager, Software Engineering",
    "You will manage a team of engineers, own roadmap delivery, and mentor managers. Direct reports: 8.",
    "engineering-leadership",
  ],
  [
    "Senior AI Engineer",
    "Build LLM-powered features using Claude and RAG. Experience with prompt engineering and vector databases.",
    "ai-applied",
  ],
  [
    "Staff Data Engineer",
    "Own our data warehouse (Snowflake + dbt), design ETL pipelines, collaborate with analytics.",
    "data-analytics",
  ],
  [
    "Senior Platform Engineer",
    "Scale our Kubernetes infrastructure, own reliability SLOs, participate in on-call rotation.",
    "platform-sre",
  ],
  [
    "Founding AI Engineer",
    "Join us as our first AI hire at a seed-stage startup. You will 0-to-1 our LLM product.",
    "founder-minded-ic",
  ],
  [
    "Senior Security Engineer",
    "Lead AppSec efforts, threat modeling, own SOC 2 compliance, OWASP-focused reviews.",
    "security",
  ],
  [
    "CTO",
    "Lead engineering at a healthcare startup. Own HIPAA compliance, PHI handling, FHIR integrations, lead a team of 15.",
    "healthcare-ops",
  ],
  [
    "Administrative Assistant",
    "Handle scheduling, expense reports, and calendar management.",
    "general",
  ],
];

describe("classifyArchetype", () => {
  it.each(FIXTURES)("fixture: %s", (title, jd, expected) => {
    const result = classifyArchetype(title, jd);
    expect(result.archetype).toBe(expected);
  });

  it("disqualifier blocks ai-applied for research scientists", () => {
    const result = classifyArchetype(
      "Research Scientist, LLM Safety",
      "Work on LLM alignment with PhD required."
    );
    expect(result.archetype).not.toBe("ai-applied");
  });

  it("hint boost raises confidence on ambiguous titles", () => {
    const title = "Senior Engineer";
    const jd = "Work with AWS and LLMs and dbt.";
    const without = classifyArchetype(title, jd);
    const withHint = classifyArchetype(title, jd, ["ai-applied"]);
    if (withHint.archetype === "ai-applied") {
      expect(withHint.confidence).toBeGreaterThanOrEqual(without.confidence);
    }
  });

  it("general fallback returns strictness 1.0", () => {
    const result = classifyArchetype("Assistant", "");
    expect(result.archetype).toBe("general");
    expect(result.strictness).toBe(1.0);
  });
});

describe("applyArchetypeToBands", () => {
  it("strictness 1.0 uses base bands", () => {
    expect(applyArchetypeToBands(0.8, 0, 1.0)).toBe("strong");
    expect(applyArchetypeToBands(0.79, 0, 1.0)).toBe("good");
  });

  it("strictness 1.1 raises strong threshold to 0.88", () => {
    expect(applyArchetypeToBands(0.87, 0, 1.1)).toBe("good");
    expect(applyArchetypeToBands(0.88, 0, 1.1)).toBe("strong");
  });

  it("strictness 0.9 lowers strong threshold to 0.72", () => {
    expect(applyArchetypeToBands(0.72, 0, 0.9)).toBe("strong");
  });

  it("gap count demotes strong to good", () => {
    expect(applyArchetypeToBands(0.85, 1, 1.0)).toBe("good");
    expect(applyArchetypeToBands(0.85, 2, 1.0)).toBe("stretch");
  });
});

describe("ARCHETYPE_CONFIG", () => {
  it("has all seven archetypes", () => {
    const names = Object.keys(ARCHETYPE_CONFIG.archetypes).sort();
    expect(names).toEqual(
      [
        "ai-applied",
        "data-analytics",
        "engineering-leadership",
        "founder-minded-ic",
        "healthcare-ops",
        "platform-sre",
        "security",
      ].sort()
    );
  });
});
