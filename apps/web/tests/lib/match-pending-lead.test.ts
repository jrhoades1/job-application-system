import { describe, it, expect } from "vitest";
import {
  pickPendingLeadToUpdate,
  type PendingLeadCandidate,
} from "@/lib/match-pending-lead";

const lead = (overrides: Partial<PendingLeadCandidate>): PendingLeadCandidate => ({
  id: overrides.id ?? "lead-x",
  company: overrides.company ?? null,
  role: overrides.role ?? null,
  career_page_url: overrides.career_page_url ?? null,
});

describe("pickPendingLeadToUpdate", () => {
  describe("exact URL match", () => {
    it("matches when career_page_url equals the import URL", () => {
      const leads = [
        lead({ id: "a", career_page_url: "https://www.linkedin.com/jobs/view/4402501651/" }),
        lead({ id: "b", career_page_url: "https://www.linkedin.com/jobs/view/9999999999/" }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://www.linkedin.com/jobs/view/4402501651/",
        "Anywhere",
        "Anything",
      );
      expect(m?.id).toBe("a");
    });
  });

  describe("canonical posting-id match", () => {
    it("matches /comm/jobs/view/X to /jobs/view/X", () => {
      const leads = [
        lead({
          id: "a",
          career_page_url: "https://www.linkedin.com/comm/jobs/view/4402501651/?trackingId=z",
        }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://www.linkedin.com/jobs/view/4402501651/",
        "Anywhere",
        "Anything",
      );
      expect(m?.id).toBe("a");
    });

    it("matches LinkedIn search-panel currentJobId URL to a /jobs/view/ lead URL — the original Nautilus bug", () => {
      const leads = [
        lead({
          id: "a",
          career_page_url: "https://www.linkedin.com/jobs/view/4403985937/",
        }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://www.linkedin.com/jobs/search/?currentJobId=4403985937&keywords=Chief%20Technology%20Officer",
        "Nautilus Data Technologies",
        "Chief Technology Officer",
      );
      expect(m?.id).toBe("a");
    });
  });

  describe("single-match fuzzy fallback", () => {
    it("matches by fuzzy company+role when lead has no career_page_url (the Search LinkedIn flow)", () => {
      const leads = [
        lead({
          id: "nautilus",
          company: "Nautilus Data Technologies",
          role: "Chief Technology Officer",
          career_page_url: null,
        }),
        lead({
          id: "shruti",
          company: "Shruti AI by Tntra",
          role: "Vice President, Digital and AI Transformation",
          career_page_url: null,
        }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://www.linkedin.com/jobs/search/?currentJobId=4403985937",
        "Nautilus Data Technologies",
        "Chief Technology Officer",
      );
      expect(m?.id).toBe("nautilus");
    });

    it("normalizes punctuation differences", () => {
      const leads = [
        lead({
          id: "a",
          company: "Nautilus Data Technologies, Inc.",
          role: "Chief Technology Officer (CTO)",
        }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://example.com/jobs/x",
        "Nautilus Data Technologies",
        "Chief Technology Officer",
      );
      expect(m?.id).toBe("a");
    });

    it("returns null when two pending leads fuzzy-match — refuses to hijack an unrelated lead", () => {
      const leads = [
        lead({ id: "a", company: "Acme", role: "Engineering Manager" }),
        lead({ id: "b", company: "Acme Corp", role: "Engineering Manager II" }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://example.com/jobs/x",
        "Acme",
        "Engineering Manager",
      );
      expect(m).toBeNull();
    });

    it("does not fuzzy-match when company differs even if role matches", () => {
      const leads = [
        lead({ id: "a", company: "Stripe", role: "Chief Technology Officer" }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://example.com/jobs/x",
        "Nautilus Data Technologies",
        "Chief Technology Officer",
      );
      expect(m).toBeNull();
    });

    it("does not fuzzy-match when role differs even if company matches", () => {
      const leads = [
        lead({ id: "a", company: "Nautilus Data Technologies", role: "VP Sales" }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://example.com/jobs/x",
        "Nautilus Data Technologies",
        "Chief Technology Officer",
      );
      expect(m).toBeNull();
    });
  });

  describe("precedence", () => {
    it("prefers exact URL match over canonical key match", () => {
      const leads = [
        lead({
          id: "canonical",
          career_page_url: "https://www.linkedin.com/comm/jobs/view/123/?trackingId=zzz",
        }),
        lead({
          id: "exact",
          career_page_url: "https://www.linkedin.com/jobs/view/123/",
        }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://www.linkedin.com/jobs/view/123/",
        "X",
        "Y",
      );
      expect(m?.id).toBe("exact");
    });

    it("prefers canonical key match over fuzzy fallback", () => {
      const leads = [
        lead({
          id: "fuzzy",
          company: "Acme",
          role: "Engineer",
          career_page_url: null,
        }),
        lead({
          id: "canonical",
          company: "Different Co",
          role: "Different Role",
          career_page_url: "https://www.linkedin.com/comm/jobs/view/777/",
        }),
      ];
      const m = pickPendingLeadToUpdate(
        leads,
        "https://www.linkedin.com/jobs/view/777/",
        "Acme",
        "Engineer",
      );
      expect(m?.id).toBe("canonical");
    });
  });

  describe("edge cases", () => {
    it("returns null when leads list is empty", () => {
      expect(
        pickPendingLeadToUpdate([], "https://example.com/x", "Co", "Role"),
      ).toBeNull();
    });

    it("returns null when no leads match", () => {
      const leads = [
        lead({ id: "a", company: "Stripe", role: "PM" }),
      ];
      expect(
        pickPendingLeadToUpdate(leads, "https://example.com/x", "Anthropic", "Engineer"),
      ).toBeNull();
    });

    it("ignores leads with null company or role for fuzzy match", () => {
      const leads = [
        lead({ id: "a", company: null, role: "Engineer" }),
        lead({ id: "b", company: "Stripe", role: null }),
      ];
      expect(
        pickPendingLeadToUpdate(leads, "https://example.com/x", "Stripe", "Engineer"),
      ).toBeNull();
    });
  });
});
