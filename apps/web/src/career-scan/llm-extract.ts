/**
 * LLM-based job extraction fallback.
 *
 * When a vendor's API returns HTML instead of JSON (Workday CxS fails, auth
 * redirect, older tenant), this helper sends the rendered HTML to Claude Haiku
 * and asks for structured job listings.
 *
 * Cost: ~$0.0005 per call (8KB input, ~2K tokens at Haiku rates).
 * Logged via createTrackedMessageForUser so it appears in Cost & Usage.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTrackedMessageForUser } from "@/lib/anthropic";
import type { JobListing } from "./types";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_HTML_CHARS = 8 * 1024;
const MAX_LISTINGS = 50;

const LlmJobSchema = z.object({
  title: z.string().min(1),
  location: z.string().optional(),
  url: z.string().optional(),
  department: z.string().optional(),
});

const LlmResponseSchema = z.object({
  jobs: z.array(LlmJobSchema).max(MAX_LISTINGS),
});

export async function extractJobsFromHtml(
  html: string,
  company: string,
  baseUrl: string,
  supabase: SupabaseClient,
  userId: string
): Promise<JobListing[]> {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)/i);
  const bodySlice = (bodyMatch?.[1] ?? html).slice(0, MAX_HTML_CHARS);

  const prompt = `Extract job listings from this ${company} careers page HTML.
Return ONLY valid JSON matching this exact shape:
{"jobs": [{"title": "...", "location": "...", "url": "...", "department": "..."}]}

Rules:
- title is REQUIRED for every job
- url should be the href to the job detail page (absolute or relative)
- Return at most ${MAX_LISTINGS} jobs
- If no jobs are found, return {"jobs": []}
- Do NOT invent or hallucinate job listings

HTML:
${bodySlice}`;

  const response = await createTrackedMessageForUser(
    {
      model: HAIKU_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    },
    "career_scan_llm_fallback",
    supabase,
    userId
  );

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  let parsed: z.infer<typeof LlmResponseSchema>;
  try {
    parsed = LlmResponseSchema.parse(JSON.parse(jsonMatch[0]));
  } catch {
    return [];
  }

  return parsed.jobs
    .filter((j) => j.title)
    .map((j, i) => ({
      externalId: j.url ?? `llm-${i}-${j.title.slice(0, 30)}`,
      title: j.title,
      url: j.url?.startsWith("http") ? j.url : `${baseUrl}${j.url ?? ""}`,
      location: j.location,
      department: j.department,
    }));
}
