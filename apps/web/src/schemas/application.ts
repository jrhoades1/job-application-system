import { z } from "zod";

export const applicationStatusSchema = z.enum([
  "evaluating",
  "pending_review",
  "ready_to_apply",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
  "accepted",
]);

export const createApplicationSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  role: z.string().min(1, "Role is required"),
  location: z.string().optional(),
  compensation: z.string().optional(),
  applied_date: z.string().optional(),
  source: z.string().optional(),
  source_url: z.string().url().optional().or(z.literal("")),
  status: applicationStatusSchema.default("evaluating"),
  job_description: z.string().max(50000).optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
});

export const updateApplicationSchema = createApplicationSchema.partial().extend({
  follow_up_date: z.string().optional().nullable(),
  resume_version: z.string().optional(),
  cover_letter: z.string().optional(),
  tailoring_intensity: z.enum(["light", "moderate", "heavy"]).optional().nullable(),
  interview_date: z.string().optional().nullable(),
  interview_round: z.number().int().positive().optional().nullable(),
  interview_type: z.string().optional().nullable(),
  interview_notes: z.string().optional().nullable(),
  rejection_date: z.string().optional().nullable(),
  rejection_reason: z.string().optional().nullable(),
  rejection_insights: z.string().optional().nullable(),
  offer: z
    .object({
      salary: z.number().optional().nullable(),
      equity: z.string().optional().nullable(),
      signing_bonus: z.number().optional().nullable(),
      remote: z.boolean().optional().nullable(),
      benefits_notes: z.string().optional().nullable(),
      decision_deadline: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  offer_accepted: z.boolean().optional().nullable(),
  learning_flags: z.array(z.string()).optional(),
  skip_date: z.string().optional().nullable(),
  skip_reason: z.string().optional().nullable(),
});

export type CreateApplication = z.infer<typeof createApplicationSchema>;
export type UpdateApplication = z.infer<typeof updateApplicationSchema>;
