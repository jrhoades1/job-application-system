import { describe, it, expect } from "vitest";
import {
  pickPromotionMatch,
  type ApplicationCandidate,
  type PromotionLead,
} from "@/lib/pick-promotion-match";

const app = (o: Partial<ApplicationCandidate>): ApplicationCandidate => ({
  id: o.id ?? "app-x",
  company: o.company ?? null,
  role: o.role ?? null,
  posting_id: o.posting_id ?? null,
});

const lead = (o: Partial<PromotionLead>): PromotionLead => ({
  promoted_application_id: o.promoted_application_id ?? null,
  posting_id: o.posting_id ?? null,
  company: o.company ?? null,
  role: o.role ?? null,
});

describe("pickPromotionMatch", () => {
  describe("posting_id match (regression for the QuadMed/Nautilus crash)", () => {
    it("links to an app with the same posting_id even when its company is wrong", () => {
      // The original bug: extension wrote an app with company="LinkedIn"
      // (wrong) but posting_id="linkedin:4403073260". Lead has the correct
      // company="QuadMed" + same posting_id. Without this match, Promote
      // hit applications_posting_id_unique on INSERT.
      const candidates = [
        app({
          id: "wrong-company-app",
          company: "LinkedIn",
          role: "Software Solutions Manager",
          posting_id: "linkedin:4403073260",
        }),
      ];
      const m = pickPromotionMatch(
        candidates,
        lead({
          company: "QuadMed",
          role: "Software Solutions Manager",
          posting_id: "linkedin:4403073260",
        }),
      );
      expect(m?.id).toBe("wrong-company-app");
    });

    it("matches by posting_id even when role differs slightly", () => {
      const candidates = [
        app({
          id: "a",
          company: "Acme",
          role: "Director, Engineering",
          posting_id: "linkedin:111",
        }),
      ];
      const m = pickPromotionMatch(
        candidates,
        lead({
          company: "Acme",
          role: "Director of Engineering",
          posting_id: "linkedin:111",
        }),
      );
      expect(m?.id).toBe("a");
    });
  });

  describe("promoted_application_id heal path", () => {
    it("returns the prior link if it exists in candidates", () => {
      const candidates = [
        app({ id: "linked", company: "Acme", role: "Engineer" }),
        app({ id: "other", company: "Acme", role: "Engineer" }),
      ];
      const m = pickPromotionMatch(
        candidates,
        lead({
          promoted_application_id: "linked",
          company: "Acme",
          role: "Engineer",
        }),
      );
      expect(m?.id).toBe("linked");
    });

    it("falls through when promoted_application_id no longer exists (deleted app)", () => {
      const candidates = [
        app({
          id: "a",
          company: "Acme",
          role: "Engineer",
          posting_id: "linkedin:1",
        }),
      ];
      const m = pickPromotionMatch(
        candidates,
        lead({
          promoted_application_id: "ghost-id-not-in-candidates",
          company: "Acme",
          role: "Engineer",
          posting_id: "linkedin:1",
        }),
      );
      expect(m?.id).toBe("a");
    });
  });

  describe("company+role exact match (original behavior)", () => {
    it("matches when posting_id is null on both sides", () => {
      const candidates = [
        app({ id: "a", company: "Stripe", role: "PM", posting_id: null }),
      ];
      const m = pickPromotionMatch(
        candidates,
        lead({ company: "Stripe", role: "PM", posting_id: null }),
      );
      expect(m?.id).toBe("a");
    });

    it("does not match if company differs even if role is identical", () => {
      const candidates = [app({ id: "a", company: "Stripe", role: "PM" })];
      const m = pickPromotionMatch(
        candidates,
        lead({ company: "Anthropic", role: "PM" }),
      );
      expect(m).toBeNull();
    });
  });

  describe("precedence", () => {
    it("prefers prior link over posting_id match", () => {
      const candidates = [
        app({ id: "linked", company: "Acme", role: "Eng", posting_id: "x:1" }),
        app({ id: "by-posting", company: "Acme", role: "Eng", posting_id: "x:2" }),
      ];
      const m = pickPromotionMatch(
        candidates,
        lead({
          promoted_application_id: "linked",
          posting_id: "x:2",
          company: "Acme",
          role: "Eng",
        }),
      );
      expect(m?.id).toBe("linked");
    });

    it("prefers posting_id over company+role when both exist", () => {
      const candidates = [
        app({ id: "by-cr", company: "Acme", role: "Eng", posting_id: null }),
        app({ id: "by-pid", company: "Different", role: "Different", posting_id: "x:1" }),
      ];
      const m = pickPromotionMatch(
        candidates,
        lead({ posting_id: "x:1", company: "Acme", role: "Eng" }),
      );
      expect(m?.id).toBe("by-pid");
    });
  });

  describe("edge cases", () => {
    it("returns null when candidates list is empty", () => {
      const m = pickPromotionMatch(
        [],
        lead({ company: "Acme", role: "Eng", posting_id: "x:1" }),
      );
      expect(m).toBeNull();
    });

    it("returns null when no candidate matches any precedence rule", () => {
      const candidates = [
        app({ id: "a", company: "Other", role: "Other", posting_id: "x:99" }),
      ];
      const m = pickPromotionMatch(
        candidates,
        lead({ company: "Acme", role: "Eng", posting_id: "x:1" }),
      );
      expect(m).toBeNull();
    });

    it("ignores posting_id match when lead.posting_id is null", () => {
      const candidates = [
        app({ id: "a", company: "Other", role: "Other", posting_id: "x:1" }),
      ];
      const m = pickPromotionMatch(
        candidates,
        lead({ company: "Acme", role: "Eng", posting_id: null }),
      );
      expect(m).toBeNull();
    });
  });
});
