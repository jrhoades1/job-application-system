/**
 * Scoring engine — public API.
 * Reexports all scoring functions for convenience.
 */

export {
  extractRequirements,
  extractKeywords,
  detectRedFlags,
  stripApplicationForm,
  isRequirement,
} from "./extract-requirements";
export type { ExtractedRequirements } from "./extract-requirements";

export { scoreRequirement } from "./score-requirement";
export type { Achievement, RequirementMatch } from "./score-requirement";

export { calculateOverallScore } from "./calculate-score";
export type { OverallScore } from "./calculate-score";

export { rankJobs } from "./rank-jobs";
export type { ScoredLead } from "./rank-jobs";

export { detectEmploymentType } from "./detect-employment";
export type { EmploymentType } from "./detect-employment";

export { detectLocationMatch } from "./detect-location";
export type { LocationResult } from "./detect-location";
