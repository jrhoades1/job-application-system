import { describe, it, expect } from "vitest";
import {
  matchRejectionToApp,
  extractRejectionReason,
  normalizeName,
  type AppliedAppRef,
} from "../../src/lib/rejection-handler";

// Real sample data from the 2026-04-15 audit — these are the 5 emails that
// landed in the inbox and the tracker rows they should bind to.

const APPS: AppliedAppRef[] = [
  {
    id: "app-mosaic",
    company: "Mosaic Health",
    role: "Associate Director Engineering",
    status: "applied",
  },
  {
    id: "app-nike",
    company: "Nike",
    role: "Director, Software Engineering",
    status: "applied",
  },
  {
    id: "app-smithrx",
    company: "SmithRx",
    role: "Manager, Software Engineering",
    status: "applied",
  },
  {
    id: "app-empower-devops",
    company: "Empower",
    role: "Director of DevOps and SRE Engineering",
    status: "applied",
  },
  {
    id: "app-empower-data",
    company: "Empower",
    role: "Director Data Engineering & Automation",
    status: "applied",
  },
  {
    id: "app-ensemble",
    company: "Ensemble Health Partners",
    role: "Director, Software Engineering",
    status: "interviewing",
  },
  {
    id: "app-directv",
    company: "DIRECTV",
    role: "Sr. Director – Technical Product Development – Operations Apps",
    status: "applied",
  },
];

describe("normalizeName", () => {
  it("strips Inc/LLC suffixes", () => {
    expect(normalizeName("Acme Inc.")).toBe("acme");
    expect(normalizeName("Foo LLC")).toBe("foo");
    expect(normalizeName("Bar Corp.")).toBe("bar");
  });

  it("is case-insensitive and trims", () => {
    expect(normalizeName("  Nike  ")).toBe("nike");
    expect(normalizeName("NIKE")).toBe("nike");
  });
});

describe("matchRejectionToApp", () => {
  it("matches Mosaic Health exactly when only one row exists", () => {
    const m = matchRejectionToApp(
      "Mosaic Health",
      "Update on your application for Associate Director Engineering at Mosaic Health",
      "Thank you for your time applying to the Associate Director Engineering position at Mosaic Health.",
      APPS
    );
    expect(m?.appId).toBe("app-mosaic");
    expect(m?.confidence).toBe("high");
    expect(m?.matchedOn).toBe("exact");
  });

  it("disambiguates between two Empower roles via role tokens in body", () => {
    const m = matchRejectionToApp(
      "Empower",
      "Thank you from Empower!",
      "Thank you for your interest in the Director of DevOps and SRE Engineering position at Empower. We appreciate the time and effort you invested in your application.",
      APPS
    );
    expect(m?.appId).toBe("app-empower-devops");
    expect(m?.confidence).toBe("high");
    expect(m?.matchedOn).toBe("exact+role");
  });

  it("returns medium confidence when company is ambiguous with no role hint", () => {
    const m = matchRejectionToApp(
      "Empower",
      "Thanks from Empower",
      "Thank you for your interest in Empower.",
      APPS
    );
    expect(m?.confidence).toBe("medium");
    // Auto-apply rule: only 'high' should write — this row should NOT be touched.
  });

  it("matches Nike on exact company with role tokens present", () => {
    const m = matchRejectionToApp(
      "Nike",
      "NIKE - Application Update",
      "We appreciate your interest in joining NIKE and the time you've invested in applying for the R-76265 Director, Software Engineering (Remote Work Option) position.",
      APPS
    );
    expect(m?.appId).toBe("app-nike");
    expect(m?.confidence).toBe("high");
  });

  it("matches SmithRx with specific role phrasing", () => {
    const m = matchRejectionToApp(
      "SmithRx",
      "Update on your application for Manager, Software Engineering with SmithRx",
      "Thank you for applying for the Manager, Software Engineering role at SmithRx. After careful review, we have decided to move forward with other candidates.",
      APPS
    );
    expect(m?.appId).toBe("app-smithrx");
    expect(m?.confidence).toBe("high");
  });

  it("matches Ensemble Health Partners despite fuzzy company extraction", () => {
    const m = matchRejectionToApp(
      "Ensemble",
      "RE: Checking In - Director, Software Engineering",
      "I apologize for the delay in an update but I just had the chance this afternoon to connect with both Arathi and Matthew Grose. They both shared they really enjoyed meeting with you but at this time they don't feel this is the right opportunity.",
      APPS
    );
    expect(m?.appId).toBe("app-ensemble");
    expect(["high", "medium"]).toContain(m?.confidence);
  });

  it("returns null when no application matches the candidate company", () => {
    const m = matchRejectionToApp(
      "UnknownCo Ltd",
      "Unfortunately we went another direction",
      "We are moving forward with other candidates.",
      APPS
    );
    expect(m).toBeNull();
  });

  it("returns null when candidate company is null", () => {
    const m = matchRejectionToApp(null, "x", "y", APPS);
    expect(m).toBeNull();
  });

  it("returns null when apps list is empty", () => {
    const m = matchRejectionToApp("Nike", "x", "y", []);
    expect(m).toBeNull();
  });
});

describe("extractRejectionReason", () => {
  it("captures the 'move forward with other candidates' sentence", () => {
    const reason = extractRejectionReason(
      "Hi Jimmy, Thank you for applying. After careful review, we have decided to move forward with other candidates whose experience more closely aligns. Best of luck."
    );
    expect(reason.toLowerCase()).toContain("move forward with other");
  });

  it("captures the 'pursue other candidates' variant", () => {
    const reason = extractRejectionReason(
      "Hello Jimmy, We have decided to pursue other candidate(s) at this time, and want to encourage you to check back."
    );
    expect(reason.toLowerCase()).toContain("pursue other candidate");
  });

  it("captures the 'right opportunity' phrase used by Ensemble", () => {
    const reason = extractRejectionReason(
      "They both shared they really enjoyed meeting with you but at this time they don't feel this is the right opportunity and are going to move forward with other candidates."
    );
    expect(reason.toLowerCase()).toContain("right opportunity");
  });

  it("caps the extracted reason at 300 chars", () => {
    const long = `Unfortunately ${"very ".repeat(200)}we cannot proceed.`;
    const reason = extractRejectionReason(long);
    expect(reason.length).toBeLessThanOrEqual(300);
  });

  it("falls back to a generic label when no signal is found", () => {
    const reason = extractRejectionReason(
      "Hi Jimmy, here is a totally unrelated note with no rejection phrasing in it at all."
    );
    expect(reason).toMatch(/generic decline|no body/i);
  });
});
