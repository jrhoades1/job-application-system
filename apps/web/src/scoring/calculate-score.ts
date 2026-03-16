/**
 * Calculate overall match score from individual requirement matches.
 * Thresholds defined in packages/scoring-rules/scoring-rules.yaml (shared with Python CLI).
 * If you change thresholds here, update the YAML and job_score.py to match.
 */

import type { RequirementMatch } from "./score-requirement";

export type ScoreSource = "scored" | "estimated";

export interface OverallScore {
  overall: "strong" | "good" | "stretch" | "long_shot";
  match_percentage: number;
  strong_count: number;
  partial_count: number;
  gap_count: number;
  score_source: ScoreSource;
}

/**
 * Apply scoring thresholds:
 * - Strong: 80%+ matched, 0 critical gaps
 * - Good: 60-80%, 0-1 gaps
 * - Stretch: 40-60%, 1-2 gaps
 * - Long shot: below 40%, multiple gaps
 */
export function calculateOverallScore(
  matches: RequirementMatch[],
  source: ScoreSource = "scored"
): OverallScore {
  if (matches.length === 0) {
    return {
      overall: "long_shot",
      match_percentage: 0,
      strong_count: 0,
      partial_count: 0,
      gap_count: 0,
      score_source: source,
    };
  }

  const strong = matches.filter((m) => m.match_type === "strong");
  const partial = matches.filter((m) => m.match_type === "partial");
  const gaps = matches.filter((m) => m.match_type === "gap");

  const total = matches.length;
  const matchPct =
    total > 0 ? (strong.length + partial.length * 0.5) / total : 0;

  let overall: OverallScore["overall"];
  if (matchPct >= 0.8 && gaps.length === 0) {
    overall = "strong";
  } else if (matchPct >= 0.6 && gaps.length <= 1) {
    overall = "good";
  } else if (matchPct >= 0.4 && gaps.length <= 2) {
    overall = "stretch";
  } else {
    overall = "long_shot";
  }

  // Estimated scores (from role-title inference without a real JD) are capped
  // at "good" — we don't have enough signal to claim "strong" match.
  if (source === "estimated" && overall === "strong") {
    overall = "good";
  }

  // With fewer than 3 requirements the score is statistically meaningless —
  // cap at "stretch" for estimated, "good" for scored.
  if (total < 3) {
    if (source === "estimated" && (overall === "strong" || overall === "good")) {
      overall = "stretch";
    } else if (overall === "strong") {
      overall = "good";
    }
  }

  return {
    overall,
    match_percentage: Math.round(matchPct * 1000) / 10,
    strong_count: strong.length,
    partial_count: partial.length,
    gap_count: gaps.length,
    score_source: source,
  };
}
