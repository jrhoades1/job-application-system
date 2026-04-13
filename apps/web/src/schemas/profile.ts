import { z } from "zod";

const achievementItemSchema = z.object({
  text: z.string(),
  learned_date: z.string().optional(),
});

const achievementCategorySchema = z.object({
  category: z.string(),
  items: z.array(achievementItemSchema),
});

const workHistoryEntrySchema = z.object({
  company: z.string(),
  title: z.string(),
  start_date: z.string(),
  end_date: z.string().optional().nullable(),
  current: z.boolean().optional(),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  linkedin_url: z.string().url().optional().or(z.literal("")).nullable(),
  portfolio_url: z.string().url().optional().or(z.literal("")).nullable(),
  achievements: z.array(achievementCategorySchema).optional().nullable(),
  work_history: z.array(workHistoryEntrySchema).optional().nullable(),
  narrative: z.string().optional().nullable(),
  preferences: z
    .object({
      location: z.string().optional(),
      min_role_level: z.string().optional(),
      industries_preferred: z.array(z.string()).optional(),
      exclude_contract: z.boolean().optional(),
      // Bullseye profile
      score_threshold: z.number().min(0).max(100).optional(),
      target_roles: z.array(z.string()).optional(),
      salary_min: z.number().nullable().optional(),
      remote_preference: z.enum(["remote", "hybrid", "onsite", "any"]).optional(),
      digest_email: z.string().email().optional().or(z.literal("")).nullable(),
      digest_frequency: z.enum(["daily", "weekly", "off"]).optional(),
      auto_generate_materials: z.boolean().optional(),
      // Pipeline lead filtering
      lead_filter_enabled: z.boolean().optional(),
      lead_filter_min_score: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type AchievementCategory = z.infer<typeof achievementCategorySchema>;
export type WorkHistoryEntry = z.infer<typeof workHistoryEntrySchema>;
