// Application status values matching the database CHECK constraint
export const APPLICATION_STATUSES = [
  "evaluating",
  "pending_review",
  "ready_to_apply",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
  "accepted",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// Match score tiers from the scoring engine
export const SCORE_TIERS = ["strong", "good", "stretch", "long_shot"] as const;
export type ScoreTier = (typeof SCORE_TIERS)[number];

// Pipeline lead statuses
export const LEAD_STATUSES = [
  "pending_review",
  "promoted",
  "skipped",
  "auto_skipped",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Tailoring intensity levels
export const TAILORING_INTENSITIES = ["light", "moderate", "heavy"] as const;
export type TailoringIntensity = (typeof TAILORING_INTENSITIES)[number];

// Status display config (label + color for badges)
export const STATUS_CONFIG: Record<
  ApplicationStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  evaluating: { label: "Evaluating", variant: "secondary" },
  pending_review: { label: "Pending Review", variant: "outline" },
  ready_to_apply: { label: "Ready to Apply", variant: "default" },
  applied: { label: "Applied", variant: "default" },
  interviewing: { label: "Interviewing", variant: "default" },
  offered: { label: "Offered", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  withdrawn: { label: "Withdrawn", variant: "secondary" },
  accepted: { label: "Accepted", variant: "default" },
};

// Score tier display config
export const SCORE_CONFIG: Record<
  ScoreTier,
  { label: string; color: string }
> = {
  strong: { label: "Strong", color: "bg-green-100 text-green-800" },
  good: { label: "Good", color: "bg-blue-100 text-blue-800" },
  stretch: { label: "Stretch", color: "bg-yellow-100 text-yellow-800" },
  long_shot: { label: "Long Shot", color: "bg-red-100 text-red-800" },
};

// Job sources
export const JOB_SOURCES = [
  "LinkedIn",
  "Indeed",
  "Glassdoor",
  "ZipRecruiter",
  "Dice",
  "Email Pipeline",
  "Direct",
  "Referral",
  "Company Website",
  "Other",
] as const;

// AI generation types
export const GENERATION_TYPES = [
  "job_analysis",
  "resume_tailor",
  "cover_letter",
  "interview_prep",
  "offer_evaluation",
] as const;
