/**
 * Score distribution helpers — letter grades + weekly trends.
 *
 * Mirrors career-ops's A/B/C/D-F grade framing. The 4-band score_overall
 * (strong/good/stretch/long_shot) is useful for ranking; letter grades
 * communicate fit at a glance and make leadership-friendly charts.
 *
 * match_percentage → grade:
 *   >= 85   → A
 *   >= 70   → B
 *   >= 55   → C
 *   >= 40   → D
 *   <  40   → F
 */

export type LetterGrade = "A" | "B" | "C" | "D" | "F";
export const ALL_GRADES: LetterGrade[] = ["A", "B", "C", "D", "F"];

export function gradeForMatchPct(matchPct: number | null | undefined): LetterGrade {
  if (matchPct == null || Number.isNaN(matchPct)) return "F";
  if (matchPct >= 85) return "A";
  if (matchPct >= 70) return "B";
  if (matchPct >= 55) return "C";
  if (matchPct >= 40) return "D";
  return "F";
}

export function emptyGradeDistribution(): Record<LetterGrade, number> {
  return { A: 0, B: 0, C: 0, D: 0, F: 0 };
}

interface AppForGrading {
  match_scores?: { match_percentage?: number | null } | Array<{ match_percentage?: number | null }> | null;
}

export function buildGradeDistribution(apps: AppForGrading[]): Record<LetterGrade, number> {
  const dist = emptyGradeDistribution();
  for (const app of apps) {
    const score = Array.isArray(app.match_scores) ? app.match_scores[0] : app.match_scores;
    if (!score || score.match_percentage == null) continue;
    dist[gradeForMatchPct(score.match_percentage)]++;
  }
  return dist;
}

interface AppForArchetypes {
  archetype?: string | null;
}

export function buildArchetypeDistribution(
  apps: AppForArchetypes[]
): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const app of apps) {
    const a = app.archetype ?? "unclassified";
    dist[a] = (dist[a] ?? 0) + 1;
  }
  return dist;
}

interface AppForTrend {
  created_at: string;
  match_scores?: { overall?: string | null } | Array<{ overall?: string | null }> | null;
}

/**
 * Returns last N weeks of counts, bucketed Monday-Sunday (ISO week), newest last.
 * Each bucket tracks band counts so a stacked bar can render trend over time.
 */
export function buildWeeklyTrend(
  apps: AppForTrend[],
  weeks: number = 12,
  now: Date = new Date()
): Array<{
  week_starting: string;
  total: number;
  strong: number;
  good: number;
  stretch: number;
  long_shot: number;
  unscored: number;
}> {
  const buckets: Array<{
    week_starting: string;
    total: number;
    strong: number;
    good: number;
    stretch: number;
    long_shot: number;
    unscored: number;
  }> = [];

  // Start of current ISO week (Monday)
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const dow = today.getUTCDay(); // 0=Sun
  const daysBack = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - daysBack);

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(thisMonday);
    weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
    buckets.push({
      week_starting: weekStart.toISOString().slice(0, 10),
      total: 0,
      strong: 0,
      good: 0,
      stretch: 0,
      long_shot: 0,
      unscored: 0,
    });
  }

  for (const app of apps) {
    const createdMs = new Date(app.created_at).getTime();
    for (const b of buckets) {
      const bucketStart = new Date(b.week_starting + "T00:00:00Z").getTime();
      const bucketEnd = bucketStart + 7 * 24 * 60 * 60 * 1000;
      if (createdMs >= bucketStart && createdMs < bucketEnd) {
        b.total++;
        const score = Array.isArray(app.match_scores) ? app.match_scores[0] : app.match_scores;
        const band = (score?.overall as keyof typeof b) ?? "unscored";
        if (band in b && band !== "total" && band !== "week_starting") {
          (b as unknown as Record<string, number>)[band]++;
        } else {
          b.unscored++;
        }
        break;
      }
    }
  }

  return buckets;
}
