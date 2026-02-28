/**
 * Detect employment type from job description.
 * Ported from job_score.py detect_employment_type()
 */

import { stripApplicationForm } from "./extract-requirements";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temp"
  | "unknown";

export function detectEmploymentType(description: string): EmploymentType {
  if (!description) return "unknown";

  const cleaned = stripApplicationForm(description);
  const lower = cleaned.toLowerCase();

  // Check for contract, excluding compliance context false positives
  const contractMatch = lower.match(/\b(?:contract|contractor|c2c|w2|1099)\b/);
  if (contractMatch) {
    const contextStart = Math.max(0, contractMatch.index! - 80);
    const context = lower.slice(contextStart, contractMatch.index! + contractMatch[0].length + 40);
    const eeoContext = [
      "federal contract",
      "government contract",
      "contract compliance",
      "subcontractor",
      "affirmative action",
    ].some((phrase) => context.includes(phrase));
    if (!eeoContext) return "contract";
  }

  if (/\b(?:part[- ]time)\b/i.test(lower)) return "part_time";
  if (/\b(?:temporary|temp position|temp role)\b/i.test(lower)) return "temp";
  if (/\b(?:full[- ]time|permanent)\b/i.test(lower)) return "full_time";

  return "full_time"; // Default assumption
}
