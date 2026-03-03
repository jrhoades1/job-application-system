import { z } from "zod";

const achievementItemSchema = z.object({
  text: z.string(),
  learned_date: z.string().optional(),
});

const achievementCategorySchema = z.object({
  category: z.string(),
  items: z.array(achievementItemSchema),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  linkedin_url: z.string().url().optional().or(z.literal("")).nullable(),
  portfolio_url: z.string().url().optional().or(z.literal("")).nullable(),
  achievements: z.array(achievementCategorySchema).optional().nullable(),
  narrative: z.string().optional().nullable(),
  preferences: z
    .object({
      location: z.string().optional(),
      min_role_level: z.string().optional(),
      industries_preferred: z.array(z.string()).optional(),
      exclude_contract: z.boolean().optional(),
    })
    .optional(),
});

export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type AchievementCategory = z.infer<typeof achievementCategorySchema>;
