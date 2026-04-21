import { describe, it, expect } from "vitest";
import {
  gradeForMatchPct,
  buildGradeDistribution,
  buildArchetypeDistribution,
  buildWeeklyTrend,
  emptyGradeDistribution,
  ALL_GRADES,
} from "@/lib/score-distribution";

describe("gradeForMatchPct", () => {
  it("returns A at >= 85", () => {
    expect(gradeForMatchPct(85)).toBe("A");
    expect(gradeForMatchPct(100)).toBe("A");
  });
  it("returns B at 70-84", () => {
    expect(gradeForMatchPct(70)).toBe("B");
    expect(gradeForMatchPct(84.9)).toBe("B");
  });
  it("returns C at 55-69", () => {
    expect(gradeForMatchPct(55)).toBe("C");
    expect(gradeForMatchPct(69.9)).toBe("C");
  });
  it("returns D at 40-54", () => {
    expect(gradeForMatchPct(40)).toBe("D");
    expect(gradeForMatchPct(54.9)).toBe("D");
  });
  it("returns F below 40", () => {
    expect(gradeForMatchPct(39.9)).toBe("F");
    expect(gradeForMatchPct(0)).toBe("F");
  });
  it("returns F for null/undefined/NaN", () => {
    expect(gradeForMatchPct(null)).toBe("F");
    expect(gradeForMatchPct(undefined)).toBe("F");
    expect(gradeForMatchPct(NaN)).toBe("F");
  });
});

describe("emptyGradeDistribution", () => {
  it("initializes every grade to 0", () => {
    const d = emptyGradeDistribution();
    for (const g of ALL_GRADES) {
      expect(d[g]).toBe(0);
    }
  });
});

describe("buildGradeDistribution", () => {
  it("buckets apps by letter grade", () => {
    const dist = buildGradeDistribution([
      { match_scores: { match_percentage: 90 } },
      { match_scores: { match_percentage: 72 } },
      { match_scores: { match_percentage: 50 } },
      { match_scores: { match_percentage: 30 } },
      { match_scores: { match_percentage: 85 } },
    ]);
    expect(dist).toEqual({ A: 2, B: 1, C: 0, D: 1, F: 1 });
  });

  it("skips unscored apps", () => {
    const dist = buildGradeDistribution([
      { match_scores: null },
      { match_scores: [] },
      { match_scores: { match_percentage: null } },
    ]);
    expect(dist).toEqual({ A: 0, B: 0, C: 0, D: 0, F: 0 });
  });

  it("handles array form of match_scores", () => {
    const dist = buildGradeDistribution([
      { match_scores: [{ match_percentage: 80 }] },
    ]);
    expect(dist.B).toBe(1);
  });
});

describe("buildArchetypeDistribution", () => {
  it("counts by archetype", () => {
    const dist = buildArchetypeDistribution([
      { archetype: "ai-applied" },
      { archetype: "ai-applied" },
      { archetype: "engineering-leadership" },
      { archetype: null },
      {},
    ]);
    expect(dist).toEqual({
      "ai-applied": 2,
      "engineering-leadership": 1,
      "unclassified": 2,
    });
  });
});

describe("buildWeeklyTrend", () => {
  const MONDAY = new Date("2026-04-20T00:00:00Z");

  it("returns exactly N buckets", () => {
    const t = buildWeeklyTrend([], 8, MONDAY);
    expect(t).toHaveLength(8);
  });

  it("has newest week last", () => {
    const t = buildWeeklyTrend([], 4, MONDAY);
    const dates = t.map((b) => b.week_starting);
    expect(dates[dates.length - 1]).toBe("2026-04-20");
    expect(new Date(dates[0]).getTime()).toBeLessThan(new Date(dates[3]).getTime());
  });

  it("bucks apps into the right week", () => {
    const apps = [
      { created_at: "2026-04-21T10:00:00Z", match_scores: { overall: "strong" } }, // this week
      { created_at: "2026-04-14T10:00:00Z", match_scores: { overall: "good" } }, // last week
      { created_at: "2026-04-20T23:59:59Z", match_scores: null }, // this week start
    ];
    const t = buildWeeklyTrend(apps, 3, MONDAY);
    const thisWeek = t[t.length - 1];
    expect(thisWeek.total).toBe(2);
    expect(thisWeek.strong).toBe(1);
    expect(thisWeek.unscored).toBe(1);
    const lastWeek = t[t.length - 2];
    expect(lastWeek.total).toBe(1);
    expect(lastWeek.good).toBe(1);
  });

  it("ignores apps outside the window", () => {
    const apps = [
      { created_at: "2020-01-01T00:00:00Z", match_scores: { overall: "strong" } },
    ];
    const t = buildWeeklyTrend(apps, 12, MONDAY);
    expect(t.reduce((sum, b) => sum + b.total, 0)).toBe(0);
  });
});
