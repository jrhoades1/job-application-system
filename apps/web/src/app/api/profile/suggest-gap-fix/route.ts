import { NextResponse } from "next/server";
import { z } from "zod";
import { createTrackedMessage } from "@/lib/anthropic";

const suggestSchema = z.object({
  gap: z.string().min(2).max(500),
  role: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  job_description: z.string().max(20000).optional(),
});

/**
 * POST /api/profile/suggest-gap-fix
 * Generates 3 short achievement-style bullets the user can pick from to
 * close a missing-from-resume gap. Suggestions are first-person, concrete,
 * and aimed at the JD requirement.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = suggestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { gap, role, company, job_description } = parsed.data;

    const prompt = `You help a job seeker close a gap on their resume for a ${role} role at ${company}.

The job description flagged this requirement as missing from their resume:
"${gap}"

${job_description ? `Job description excerpt:\n${job_description.slice(0, 2000)}\n\n` : ""}Write 3 distinct achievement bullets the candidate could add to their profile to address this gap. Each bullet should:
- Start with a strong action verb (Built, Led, Designed, Delivered, etc.)
- Be specific and concrete (include scale, tech, or outcome where plausible)
- Be 15-25 words
- Be in first-person past tense without using "I"
- Be a realistic thing a senior professional in this field might have actually done
- Avoid em dashes

Return ONLY a JSON array of 3 strings. No markdown, no commentary. Example:
["Built X to do Y, achieving Z.", "Led A initiative...", "Designed B system..."]`;

    const response = await createTrackedMessage(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      },
      "suggest_gap_fix"
    );

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    let suggestions: string[] = [];
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsedJson = JSON.parse(match[0]);
        if (Array.isArray(parsedJson)) {
          suggestions = parsedJson
            .filter((s) => typeof s === "string" && s.trim().length > 0)
            .map((s) => s.trim())
            .slice(0, 3);
        }
      }
    } catch {
      suggestions = [];
    }

    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: "Could not generate suggestions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
