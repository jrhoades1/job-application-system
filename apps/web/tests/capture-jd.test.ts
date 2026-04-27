import { describe, it, expect } from "vitest";
import { parsePageTitle } from "../../extension/src/lib/parse-page-title";

/**
 * Tests for the JD capture page title parsing logic.
 * Imports the SAME function the Chrome extension uses — never reimplement
 * inline. (A previous duplicate copy here drifted from the extension and
 * masked the LinkedIn search-panel "company=LinkedIn" bug.)
 */

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = na.split(" ");
  const wordsB = nb.split(" ");
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length > wordsB.length ? wordsA : wordsB;
  const longerText = longer.join(" ");
  const matches = shorter.filter((w) => w.length > 2 && longerText.includes(w));
  return matches.length >= Math.ceil(shorter.length * 0.5);
}

describe("parsePageTitle", () => {
  it("parses LinkedIn hiring format", () => {
    const result = parsePageTitle(
      "Perfecting Peds hiring Director of Engineering in United States | LinkedIn"
    );
    expect(result.company).toBe("Perfecting Peds");
    expect(result.title).toBe("Director of Engineering");
  });

  it("parses LinkedIn hiring format with notification count", () => {
    const result = parsePageTitle(
      "(2) Perfecting Peds hiring Director of Engineering in United States | LinkedIn"
    );
    // The (2) prefix will be part of company — need to handle this
    expect(result.title).toBe("Director of Engineering");
  });

  it("parses LinkedIn dash format", () => {
    const result = parsePageTitle(
      "Director of Engineering - Perfecting Peds | LinkedIn"
    );
    expect(result.title).toBe("Director of Engineering");
    expect(result.company).toBe("Perfecting Peds");
  });

  it("parses LinkedIn dash format with notification count", () => {
    const result = parsePageTitle(
      "(2) Director of Engineering - Perfecting Peds | LinkedIn"
    );
    expect(result.title).toContain("Director of Engineering");
  });

  it("parses ZipRecruiter format", () => {
    const result = parsePageTitle(
      "Vice President of Engineering - Rezilient Health | ZipRecruiter"
    );
    expect(result.title).toBe("Vice President of Engineering");
    expect(result.company).toBe("Rezilient Health");
  });

  it("parses Indeed format", () => {
    const result = parsePageTitle(
      "Software Engineer - Google - Mountain View, CA | Indeed.com"
    );
    expect(result.title).toBe("Software Engineer");
    expect(result.company).toBe("Google");
  });

  it("parses generic 'at' format", () => {
    const result = parsePageTitle("Software Engineer at Stripe");
    expect(result.title).toBe("Software Engineer");
    expect(result.company).toBe("Stripe");
  });

  it("returns empty for unparseable titles", () => {
    const result = parsePageTitle("LinkedIn");
    expect(result.title).toBeUndefined();
    expect(result.company).toBeUndefined();
  });

  describe("platform-name denylist (regression)", () => {
    // Before the denylist, on LinkedIn search-panel pages with tab title
    // "(2) Chief Technology Officer Nautilus Data Technologies | LinkedIn",
    // the generic "Role | Company" regex returned company="LinkedIn", which
    // the import-job route then stored as the application's company. Two real
    // production rows were created with company="LinkedIn" before this was
    // caught (Nautilus Data Technologies CTO, QuadMed Software Solutions Mgr).
    it("rejects company='LinkedIn' from LinkedIn search-panel tab titles", () => {
      const result = parsePageTitle(
        "Chief Technology Officer Nautilus Data Technologies | LinkedIn"
      );
      expect(result.company).toBeUndefined();
    });

    it("rejects company='LinkedIn' even with notification-count prefix", () => {
      const result = parsePageTitle(
        "(2) Software Solutions Manager QuadMed | LinkedIn"
      );
      expect(result.company).toBeUndefined();
    });

    it("rejects company='Indeed.com' from Indeed search tabs", () => {
      const result = parsePageTitle(
        "Software Engineer | Indeed.com"
      );
      expect(result.company).toBeUndefined();
    });

    it("rejects company='ZipRecruiter' from ZipRecruiter search tabs", () => {
      const result = parsePageTitle(
        "Director of Engineering | ZipRecruiter"
      );
      expect(result.company).toBeUndefined();
    });

    it("rejects company='Glassdoor' from generic match", () => {
      const result = parsePageTitle(
        "Senior Engineer at Glassdoor"
      );
      // "Glassdoor" the company would be a tiny edge case (real Glassdoor jobs
      // exist but this title pattern overwhelmingly comes from search tabs).
      expect(result.company).toBeUndefined();
    });

    it("is case-insensitive on the denylist", () => {
      expect(parsePageTitle("Engineer | linkedin").company).toBeUndefined();
      expect(parsePageTitle("Engineer | LINKEDIN").company).toBeUndefined();
    });

    it("still extracts a real company that happens to share words with a platform", () => {
      const result = parsePageTitle(
        "Director - LinkedIn-style Inc | LinkedIn"
      );
      expect(result.company).toBe("LinkedIn-style Inc");
    });
  });
});

describe("fuzzyMatch", () => {
  it("matches exact strings", () => {
    expect(fuzzyMatch("Perfecting Peds", "Perfecting Peds")).toBe(true);
  });

  it("matches substring", () => {
    expect(fuzzyMatch("Director of Engineering", "Director of Engineering")).toBe(true);
  });

  it("matches when one contains the other", () => {
    expect(fuzzyMatch("VP of Engineering", "VP of Engineering - Senior")).toBe(true);
  });

  it("matches by word overlap", () => {
    expect(fuzzyMatch("Director of Software Engineering", "Director Software Engineering")).toBe(true);
  });

  it("does not match completely different strings", () => {
    expect(fuzzyMatch("Perfecting Peds", "LinkedIn")).toBe(false);
  });

  it("does not match Unknown Role", () => {
    expect(fuzzyMatch("Unknown Role", "Director of Engineering")).toBe(false);
  });
});
