import { describe, it, expect } from "vitest";
import {
  resolveWindow,
  startOfIsoWeekUTC,
  startOfMonthUTC,
  toDateOnly,
} from "../../src/lib/date-windows";

describe("date-windows", () => {
  // Anchor: Tue 2026-04-14 UTC — mid-week, mid-month, mid-year.
  const anchor = new Date(Date.UTC(2026, 3, 14, 18, 30));

  describe("startOfIsoWeekUTC", () => {
    it("returns Monday for a mid-week Tuesday", () => {
      expect(toDateOnly(startOfIsoWeekUTC(anchor))).toBe("2026-04-13");
    });

    it("returns the same day when given Monday", () => {
      const mon = new Date(Date.UTC(2026, 3, 13, 9, 0));
      expect(toDateOnly(startOfIsoWeekUTC(mon))).toBe("2026-04-13");
    });

    it("returns the previous Monday when given Sunday (ISO week rolls back)", () => {
      const sun = new Date(Date.UTC(2026, 3, 12, 23, 0));
      expect(toDateOnly(startOfIsoWeekUTC(sun))).toBe("2026-04-06");
    });
  });

  describe("startOfMonthUTC", () => {
    it("returns the first of the month", () => {
      expect(toDateOnly(startOfMonthUTC(anchor))).toBe("2026-04-01");
    });
  });

  describe("resolveWindow: today", () => {
    it("starts at midnight and ends tomorrow midnight", () => {
      const r = resolveWindow("today", anchor);
      expect(toDateOnly(r.start!)).toBe("2026-04-14");
      expect(toDateOnly(r.end)).toBe("2026-04-15");
      expect(toDateOnly(r.prevStart!)).toBe("2026-04-13");
      expect(toDateOnly(r.prevEnd!)).toBe("2026-04-14");
      expect(r.bucketCount).toBe(1);
    });
  });

  describe("resolveWindow: week", () => {
    it("starts Monday, ends tomorrow midnight, prev is full prior week", () => {
      const r = resolveWindow("week", anchor);
      expect(toDateOnly(r.start!)).toBe("2026-04-13");
      expect(toDateOnly(r.end)).toBe("2026-04-15");
      expect(toDateOnly(r.prevStart!)).toBe("2026-04-06");
      expect(toDateOnly(r.prevEnd!)).toBe("2026-04-13");
      expect(r.bucketCount).toBe(7);
    });
  });

  describe("resolveWindow: month", () => {
    it("starts on the 1st, prev window is the previous calendar month", () => {
      const r = resolveWindow("month", anchor);
      expect(toDateOnly(r.start!)).toBe("2026-04-01");
      expect(toDateOnly(r.prevStart!)).toBe("2026-03-01");
      expect(toDateOnly(r.prevEnd!)).toBe("2026-04-01");
      expect(r.bucketCount).toBe(30); // April has 30 days
    });
  });

  describe("resolveWindow: ytd", () => {
    it("starts Jan 1, prev is prior year Jan 1", () => {
      const r = resolveWindow("ytd", anchor);
      expect(toDateOnly(r.start!)).toBe("2026-01-01");
      expect(toDateOnly(r.prevStart!)).toBe("2025-01-01");
      expect(toDateOnly(r.prevEnd!)).toBe("2026-01-01");
      expect(r.bucket).toBe("month");
    });
  });

  describe("resolveWindow: all", () => {
    it("has no lower bound and no prev window", () => {
      const r = resolveWindow("all", anchor);
      expect(r.start).toBeNull();
      expect(r.prevStart).toBeNull();
      expect(r.prevEnd).toBeNull();
    });
  });

  describe("DST-adjacent dates behave as UTC days", () => {
    it("weeks around DST still start on Monday", () => {
      const dstAnchor = new Date(Date.UTC(2026, 2, 10, 6, 0));
      const r = resolveWindow("week", dstAnchor);
      expect(toDateOnly(r.start!)).toBe("2026-03-09");
      expect(toDateOnly(r.prevStart!)).toBe("2026-03-02");
    });
  });
});
