import { describe, it, expect } from "vitest";
import { evaluateStage1, type LeadFilterPrefs } from "@/lib/lead-filter";

const PREFS: LeadFilterPrefs = {
  lead_filter_enabled: true,
  min_role_level: "director",
  remote_preference: "remote",
  salary_min: null,
};

const PREFS_MID: LeadFilterPrefs = {
  lead_filter_enabled: true,
  min_role_level: "mid",
  remote_preference: "remote",
  salary_min: null,
};

const PREFS_MANAGER: LeadFilterPrefs = {
  lead_filter_enabled: true,
  min_role_level: "manager",
  remote_preference: "remote",
  salary_min: null,
};

function stage1(role: string, prefs = PREFS, strict = true, location?: string) {
  return evaluateStage1(
    { role, company: "FakeCo", location: location ?? null },
    prefs,
    { strict }
  );
}

describe("evaluateStage1 — strict mode engineering-only", () => {
  it("rejects Senior Product Manager (product is not engineering)", () => {
    expect(stage1("Senior Product Manager, Fraud & Trust").pass).toBe(false);
  });

  it("rejects Principal Product Manager", () => {
    expect(stage1("Principal Product Manager, Agentic Commerce").pass).toBe(
      false
    );
  });

  it("rejects Senior Technical Project Manager", () => {
    expect(stage1("Senior Technical Project Manager").pass).toBe(false);
  });

  it("allows Data Engineering Manager when min=manager (engineering via 'engineering' keyword)", () => {
    expect(
      stage1("Data Engineering Manager, Core Experience", PREFS_MANAGER).pass
    ).toBe(true);
  });

  it("allows ML Engineering Manager when min=manager", () => {
    expect(
      stage1("Engineering Manager, Machine Learning", PREFS_MANAGER).pass
    ).toBe(true);
  });
});

describe("evaluateStage1 — strict mode discipline rejections", () => {
  it("rejects ambiguous administrative titles", () => {
    const r = stage1("Administrative Coordinator");
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/ambiguous|non-technical/i);
  });

  it("rejects Administrative Business Partner", () => {
    expect(stage1("Administrative Business Partner").pass).toBe(false);
  });

  it("rejects regulatory/licensing specialist", () => {
    expect(
      stage1("Affiliate Services Licensing Specialist, Regulatory Affairs").pass
    ).toBe(false);
  });

  it("rejects null-discipline titles like 'Learning Manager'", () => {
    expect(stage1("Learning Manager").pass).toBe(false);
  });

  it("allows explicit Director of Engineering", () => {
    expect(stage1("Director of Engineering").pass).toBe(true);
  });

  it("allows VP of Engineering", () => {
    expect(stage1("VP of Engineering").pass).toBe(true);
  });

  it("allows Head of Platform", () => {
    expect(stage1("Head of Platform").pass).toBe(true);
  });
});

describe("evaluateStage1 — strict mode seniority rejections", () => {
  it("rejects bare 'Android Engineer, Terminal' when min=director", () => {
    // Passes discipline=engineering, but seniority=mid (bare engineer fallback)
    // < director → reject
    const r = stage1("Android Engineer, Terminal");
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/Seniority/i);
  });

  it("rejects 'Senior Software Engineer' when min=director", () => {
    const r = stage1("Senior Software Engineer");
    expect(r.pass).toBe(false);
  });

  it("allows 'Senior Software Engineer' when min=mid", () => {
    const r = stage1("Senior Software Engineer", PREFS_MID);
    expect(r.pass).toBe(true);
  });

  it("allows bare 'Android Engineer' when min=mid (mid fallback)", () => {
    expect(stage1("Android Engineer", PREFS_MID).pass).toBe(true);
  });
});

describe("evaluateStage1 — strict vs fail-open parity", () => {
  it("non-strict mode still fails open on ambiguous admin title", () => {
    const r = stage1("Administrative Coordinator", PREFS_MID, false);
    // Would only be rejected on seniority if min_role_level caught it;
    // "coordinator" is not in detectSeniority keywords → null → fail-open
    // under non-strict. Result should be pass=true (the old behavior).
    expect(r.pass).toBe(true);
  });

  it("strict mode rejects remote-onsite mismatch same as non-strict", () => {
    const r = stage1(
      "Director of Engineering",
      PREFS,
      true,
      "On-site in New York"
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/Location/i);
  });
});
