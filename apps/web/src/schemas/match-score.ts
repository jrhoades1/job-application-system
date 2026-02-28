import { z } from "zod";

export const matchScoreSchema = z.object({
  overall: z.enum(["strong", "good", "stretch", "long_shot"]),
  match_percentage: z.number().min(0).max(100).optional(),
  strong_count: z.number().int().min(0).default(0),
  partial_count: z.number().int().min(0).default(0),
  gap_count: z.number().int().min(0).default(0),
  requirements_matched: z.array(z.object({
    requirement: z.string(),
    evidence: z.string().optional(),
    category: z.string().optional(),
  })).default([]),
  requirements_partial: z.array(z.object({
    requirement: z.string(),
    evidence: z.string().optional(),
    category: z.string().optional(),
  })).default([]),
  gaps: z.array(z.string()).default([]),
  addressable_gaps: z.array(z.string()).default([]),
  hard_gaps: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  red_flags: z.array(z.string()).default([]),
});

export type MatchScore = z.infer<typeof matchScoreSchema>;
