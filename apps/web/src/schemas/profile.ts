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
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin_url: z.string().url().optional().or(z.literal("")),
  portfolio_url: z.string().url().optional().or(z.literal("")),
  achievements: z.array(achievementCategorySchema).optional(),
  narrative: z.string().optional(),
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
