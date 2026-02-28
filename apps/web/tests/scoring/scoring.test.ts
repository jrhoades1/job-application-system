/**
 * Tests for scoring engine — ported from test_job_score.py
 */

import { describe, it, expect } from "vitest";
import {
  extractRequirements,
  scoreRequirement,
  calculateOverallScore,
  rankJobs,
  detectEmploymentType,
  detectLocationMatch,
} from "../../src/scoring";

const SAMPLE_ACHIEVEMENTS = {
  "Leadership & Team Building": [
    "Built engineering team from zero to 22 (MedQuest)",
    "Managed 50+ developers across US, Ukraine, and Central America (Cognizant)",
    "Mentored engineers on agile best practices",
  ],
  "AI / ML Integration": [
    "Spearheaded AI/ML integration into healthcare workflows",
    "Integrated AI into product offerings, slashing development cycles by 30%",
  ],
  "Healthcare IT & Compliance": [
    "Overhauled system architecture for HIPAA compliance, achieving 99.9% uptime",
    "Led technical reviews ensuring compliance with HL7, FHIR standards",
  ],
  "Architecture & Scalability": [
    "Transformed monolithic app into scalable microservices and multi-tenant architecture",
    "Designed microservices architecture cutting latency by 20%",
    "Executed AWS integrations accelerating deployment timelines by 25%",
  ],
};

describe("scoreRequirement", () => {
  it("strong match — team building", () => {
    const result = scoreRequirement(
      "Experience building and managing engineering teams from scratch",
      SAMPLE_ACHIEVEMENTS
    );
    expect(result.match_type).toBe("strong");
    expect(result.evidence).toBeTruthy();
  });

  it("gap — no match for quantum computing", () => {
    const result = scoreRequirement(
      "PhD in quantum computing",
      SAMPLE_ACHIEVEMENTS
    );
    expect(result.match_type).toBe("gap");
  });

  it("strong match — HIPAA keyword", () => {
    const result = scoreRequirement(
      "Experience with HIPAA compliance in healthcare",
      SAMPLE_ACHIEVEMENTS
    );
    expect(result.match_type).toBe("strong");
    expect(result.category).toContain("Healthcare");
  });

  it("strong match — AI/ML", () => {
    const result = scoreRequirement(
      "Experience integrating AI and ML into products",
      SAMPLE_ACHIEVEMENTS
    );
    expect(result.match_type).toBe("strong");
  });
});

describe("calculateOverallScore", () => {
  it("strong score — 90% match, no gaps", () => {
    const matches = [
      ...Array(9).fill({ match_type: "strong" as const, requirement: "", evidence: "", category: "" }),
      { match_type: "partial" as const, requirement: "", evidence: "", category: "" },
    ];
    const result = calculateOverallScore(matches);
    expect(result.overall).toBe("strong");
    expect(result.match_percentage).toBeGreaterThanOrEqual(80);
  });

  it("good score", () => {
    const matches = [
      ...Array(5).fill({ match_type: "strong" as const, requirement: "", evidence: "", category: "" }),
      ...Array(3).fill({ match_type: "partial" as const, requirement: "", evidence: "", category: "" }),
      { match_type: "gap" as const, requirement: "", evidence: "", category: "" },
    ];
    const result = calculateOverallScore(matches);
    expect(result.overall).toBe("good");
  });

  it("long shot — mostly gaps", () => {
    const matches = [
      { match_type: "strong" as const, requirement: "", evidence: "", category: "" },
      ...Array(8).fill({ match_type: "gap" as const, requirement: "", evidence: "", category: "" }),
    ];
    const result = calculateOverallScore(matches);
    expect(result.overall).toBe("long_shot");
  });

  it("empty matches → long_shot", () => {
    const result = calculateOverallScore([]);
    expect(result.overall).toBe("long_shot");
    expect(result.match_percentage).toBe(0);
  });
});

describe("rankJobs", () => {
  it("ranks by tier → match% → gaps → name", () => {
    const leads = [
      { company: "C", role: "R", score_result: { overall: "stretch", match_percentage: 50, gap_count: 2 } },
      { company: "A", role: "R", score_result: { overall: "strong", match_percentage: 90, gap_count: 0 } },
      { company: "B", role: "R", score_result: { overall: "good", match_percentage: 70, gap_count: 1 } },
    ];
    const ranked = rankJobs(leads);
    expect(ranked[0].company).toBe("A");
    expect(ranked[1].company).toBe("B");
    expect(ranked[2].company).toBe("C");
  });

  it("tiebreaker by match percentage", () => {
    const leads = [
      { company: "B", role: "R", score_result: { overall: "good", match_percentage: 65, gap_count: 1 } },
      { company: "A", role: "R", score_result: { overall: "good", match_percentage: 75, gap_count: 1 } },
    ];
    const ranked = rankJobs(leads);
    expect(ranked[0].company).toBe("A");
  });

  it("assigns rank numbers", () => {
    const leads = [
      { company: "A", role: "R", score_result: { overall: "strong", match_percentage: 90, gap_count: 0 } },
      { company: "B", role: "R", score_result: { overall: "good", match_percentage: 70, gap_count: 1 } },
    ];
    const ranked = rankJobs(leads);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });
});

describe("detectEmploymentType", () => {
  it("detects full-time", () => {
    expect(detectEmploymentType("This is a full-time position")).toBe("full_time");
  });

  it("detects contract", () => {
    expect(detectEmploymentType("Looking for a contractor for 6 months")).toBe("contract");
  });

  it("detects part-time", () => {
    expect(detectEmploymentType("This is a part-time role")).toBe("part_time");
  });

  it("defaults to full_time", () => {
    expect(detectEmploymentType("Join our engineering team")).toBe("full_time");
  });

  it("returns unknown for empty", () => {
    expect(detectEmploymentType("")).toBe("unknown");
  });
});

describe("detectLocationMatch", () => {
  it("remote matches remote preference", () => {
    const result = detectLocationMatch("This is a fully remote position", {
      location: "Remote (US)",
    });
    expect(result.match).toBe(true);
    expect(result.remote_status).toBe("remote");
  });

  it("onsite doesn't match remote preference", () => {
    const result = detectLocationMatch(
      "This is an on-site position in NYC",
      { location: "Remote (US)" }
    );
    expect(result.match).toBe(false);
    expect(result.remote_status).toBe("onsite");
  });

  it("detects hybrid", () => {
    const result = detectLocationMatch(
      "We offer a hybrid work arrangement",
      { location: "Remote (US)" }
    );
    expect(result.match).toBe(false);
    expect(result.remote_status).toBe("hybrid");
  });
});

describe("extractRequirements", () => {
  it("extracts structured sections", () => {
    const desc = `
About the Role
We are looking for a VP of Engineering.

Requirements:
- 10+ years of engineering leadership experience
- Experience building teams from scratch
- HIPAA compliance background
- Strong AWS experience

Preferred:
- Healthcare industry experience
- AI/ML familiarity

Responsibilities:
- Lead the engineering organization
- Define technical strategy
`;
    const result = extractRequirements(desc);
    expect(result.hard_requirements.length).toBeGreaterThan(0);
    expect(result.preferred.length).toBeGreaterThan(0);
    expect(result.responsibilities.length).toBeGreaterThan(0);
  });

  it("returns empty for empty description", () => {
    const result = extractRequirements("");
    expect(result.hard_requirements).toEqual([]);
    expect(result.preferred).toEqual([]);
  });
});
