import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage, SpendCapExceededError } from "@/lib/anthropic";
import {
  extractRequirements,
  scoreRequirement,
  calculateOverallScore,
  detectEmploymentType,
  detectLocationMatch,
  extractKeywords,
} from "@/scoring";
import { buildAnalyzeJobPrompt } from "@/ai/analyze-job";

const analyzeSchema = z.object({
  job_description: z.string().min(50).max(50000),
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const parsed = analyzeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { job_description, company, role } = parsed.data;

    // Load user achievements
    const { data: profile } = await supabase
      .from("profiles")
      .select("achievements, preferences")
      .eq("clerk_user_id", userId)
      .single();

    // Convert structured achievements to flat map for scoring
    const achievementsMap: Record<string, string[]> = {};
    const achievements = profile?.achievements ?? [];
    if (Array.isArray(achievements)) {
      for (const cat of achievements) {
        if (cat.category && Array.isArray(cat.items)) {
          achievementsMap[cat.category] = cat.items.map(
            (i: { text: string }) => i.text
          );
        }
      }
    }

    // Build achievements markdown for AI prompt
    const achievementsMd = Object.entries(achievementsMap)
      .map(
        ([cat, items]) =>
          `## ${cat}\n${items.map((i) => `- ${i}`).join("\n")}`
      )
      .join("\n\n");

    // Step 1: Algorithmic scoring
    const requirements = extractRequirements(job_description);
    const allReqs = [
      ...requirements.hard_requirements,
      ...requirements.preferred,
    ];

    const matches = allReqs.map((req) =>
      scoreRequirement(req, achievementsMap)
    );
    const score = calculateOverallScore(matches);

    const employmentType = detectEmploymentType(job_description);
    const locationInfo = detectLocationMatch(
      job_description,
      profile?.preferences ?? {}
    );
    const keywords = extractKeywords(job_description);

    // Step 2: AI enhancement
    let aiAnalysis = null;
    try {
      const prompt = buildAnalyzeJobPrompt({
        jobDescription: job_description,
        company,
        role,
        requirements,
        matches,
        score,
        achievements: achievementsMd,
      });

      const response = await createTrackedMessage(
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        },
        "analyze_job"
      );

      const content =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiAnalysis = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      if (err instanceof SpendCapExceededError) {
        return NextResponse.json(
          { error: "Monthly AI spend cap exceeded", cap: err.cap },
          { status: 429 }
        );
      }
      // AI enhancement failed — return algorithmic results only
      console.error("AI analysis failed:", err);
    }

    return NextResponse.json({
      score,
      requirements,
      matches,
      keywords,
      employment_type: employmentType,
      location: locationInfo,
      red_flags: requirements.red_flags,
      ai_analysis: aiAnalysis,
    });
  } catch (err) {
    console.error("Analyze job error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
