/**
 * Rank scored job leads for user review.
 * Ported from job_score.py rank_jobs()
 */

export interface ScoredLead {
  company: string;
  role: string;
  score_result: {
    overall: string;
    match_percentage: number;
    gap_count: number;
    strong_count?: number;
    partial_count?: number;
  };
  rank?: number;
  [key: string]: unknown;
}

const SCORE_ORDER: Record<string, number> = {
  strong: 0,
  good: 1,
  stretch: 2,
  long_shot: 3,
};

/**
 * Rank scored leads:
 * Primary: score tier (strong > good > stretch > long_shot)
 * Secondary: match percentage (descending)
 * Tertiary: gap count (ascending)
 * Tiebreaker: company name alphabetical
 */
export function rankJobs<T extends ScoredLead>(leads: T[]): T[] {
  const ranked = [...leads].sort((a, b) => {
    const aScore = a.score_result;
    const bScore = b.score_result;

    // Primary: score tier
    const tierDiff =
      (SCORE_ORDER[aScore.overall] ?? 3) -
      (SCORE_ORDER[bScore.overall] ?? 3);
    if (tierDiff !== 0) return tierDiff;

    // Secondary: match percentage (descending)
    const pctDiff =
      (bScore.match_percentage ?? 0) - (aScore.match_percentage ?? 0);
    if (pctDiff !== 0) return pctDiff;

    // Tertiary: gap count (ascending)
    const gapDiff = (aScore.gap_count ?? 99) - (bScore.gap_count ?? 99);
    if (gapDiff !== 0) return gapDiff;

    // Tiebreaker: company name
    return a.company.toLowerCase().localeCompare(b.company.toLowerCase());
  });

  ranked.forEach((lead, i) => {
    lead.rank = i + 1;
  });

  return ranked;
}
