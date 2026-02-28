// Re-export all types from schemas for convenience
export type { CreateApplication, UpdateApplication } from "@/schemas/application";
export type { UpdateProfile, AchievementCategory } from "@/schemas/profile";
export type { MatchScore } from "@/schemas/match-score";

// Database row types (what comes back from Supabase queries)
export interface ApplicationRow {
  id: string;
  clerk_user_id: string;
  company: string;
  role: string;
  location: string | null;
  compensation: string | null;
  applied_date: string | null;
  source: string | null;
  source_url: string | null;
  status: string;
  follow_up_date: string | null;
  contact: string;
  notes: string;
  resume_version: string | null;
  cover_letter: string | null;
  job_description: string | null;
  former_employer: boolean;
  tailoring_intensity: string | null;
  interview_date: string | null;
  interview_round: number | null;
  interview_type: string | null;
  interview_notes: string | null;
  rejection_date: string | null;
  rejection_reason: string | null;
  rejection_insights: string | null;
  offer: {
    salary?: number | null;
    equity?: string | null;
    signing_bonus?: number | null;
    remote?: boolean | null;
    benefits_notes?: string | null;
    decision_deadline?: string | null;
  } | null;
  offer_accepted: boolean | null;
  learning_flags: string[];
  skip_date: string | null;
  skip_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  clerk_user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  achievements: { category: string; items: { text: string; learned_date?: string }[] }[];
  narrative: string | null;
  base_resume_url: string | null;
  preferences: {
    location?: string;
    min_role_level?: string;
    industries_preferred?: string[];
    exclude_contract?: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface MatchScoreRow {
  id: string;
  application_id: string;
  clerk_user_id: string;
  overall: string;
  match_percentage: number | null;
  strong_count: number;
  partial_count: number;
  gap_count: number;
  requirements_matched: { requirement: string; evidence?: string; category?: string }[];
  requirements_partial: { requirement: string; evidence?: string; category?: string }[];
  gaps: string[];
  addressable_gaps: string[];
  hard_gaps: string[];
  keywords: string[];
  red_flags: string[];
  created_at: string;
}

// Extended type when API joins match_scores onto application
export interface ApplicationWithScores extends ApplicationRow {
  match_scores: MatchScoreRow | MatchScoreRow[] | null;
}

export interface PipelineLeadRow {
  id: string;
  clerk_user_id: string;
  company: string;
  role: string;
  source_platform: string | null;
  career_page_url: string | null;
  description_text: string | null;
  score_overall: string | null;
  score_match_percentage: number | null;
  score_details: Record<string, unknown> | null;
  status: string;
  skip_reason: string | null;
  location: string | null;
  red_flags: string[];
  rank: number | null;
  created_at: string;
}
