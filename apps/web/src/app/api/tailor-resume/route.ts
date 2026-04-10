import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage, ApplicationQuotaExceededError } from "@/lib/anthropic";
import { buildTailorResumePrompt } from "@/ai/tailor-resume";
import {
  extractRequirements,
  calculateOverallScore,
  checkAtsKeywords,
  extractAtsKeywords,
} from "@/scoring";
import { extractRequirementsWithAI } from "@/lib/extract-requirements-ai";
import { scoreRequirementsWithAI } from "@/scoring/score-requirements-ai";

const tailorSchema = z.object({
  application_id: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const parsed = tailorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Load application + match score
    const { data: app } = await supabase
      .from("applications")
      .select("*, match_scores(*)")
      .eq("id", parsed.data.application_id)
      .eq("clerk_user_id", userId)
      .single();

    if (!app) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Load profile (including contact info and work history for resume header)
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, location, linkedin_url, portfolio_url, achievements, work_history, narrative")
      .eq("clerk_user_id", userId)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found. Please set up your profile first." },
        { status: 400 }
      );
    }

    const score = Array.isArray(app.match_scores)
      ? app.match_scores[0]
      : app.match_scores;

    // Build achievements text
    const achievements = (profile.achievements ?? [])
      .map(
        (cat: { category: string; items: { text: string }[] }) =>
          `## ${cat.category}\n${cat.items.map((i) => `- ${i.text}`).join("\n")}`
      )
      .join("\n\n");

    // Extract ATS keywords from JD to feed into tailoring prompt
    const atsKws = app.job_description
      ? extractAtsKeywords(app.job_description).map((k) => k.keyword)
      : [];

    const prompt = buildTailorResumePrompt({
      baseResume: achievements, // Use achievements as resume base if no file
      jobDescription: app.job_description ?? "",
      company: app.company,
      role: app.role,
      matchScore: score?.overall ?? "stretch",
      keywords: score?.keywords ?? [],
      atsKeywords: atsKws,
      strongMatches: (score?.requirements_matched ?? []).map(
        (r: { requirement: string }) => r.requirement
      ),
      gaps: score?.gaps ?? [],
      addressableGaps: score?.addressable_gaps ?? [],
      achievements,
      narrative: profile.narrative ?? "",
      contactInfo: {
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        linkedin_url: profile.linkedin_url,
        portfolio_url: profile.portfolio_url,
      },
      workHistory: profile.work_history ?? [],
    });

    const response = await createTrackedMessage(
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      },
      "tailor_resume",
      parsed.data.application_id
    );

    const rawContent =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse match percentage from AI response (last line: "MATCH_PERCENTAGE: 85")
    let aiMatchPct: number | null = null;
    let content = rawContent;
    const pctMatch = rawContent.match(/\nMATCH_PERCENTAGE:\s*(\d+(?:\.\d+)?)\s*$/);
    if (pctMatch) {
      aiMatchPct = parseFloat(pctMatch[1]);
      content = rawContent.slice(0, pctMatch.index).trimEnd();
    }

    // Update application with content and version label
    await supabase
      .from("applications")
      .update({
        resume_version: `tailored_${new Date().toISOString().slice(0, 10)}`,
        tailored_resume: content,
      })
      .eq("id", app.id);

    // --- Score the tailored RESUME TEXT against JD requirements ---
    let resumeMatchPct: number | null = aiMatchPct;
    let resumeGaps: string[] = [];

    if (app.job_description) {
      try {
        // Extract requirements from JD
        const reqs = extractRequirements(app.job_description);
        let allReqs = [...reqs.hard_requirements, ...reqs.preferred];

        if (allReqs.length === 0 && app.job_description.length > 200) {
          const aiReqs = await extractRequirementsWithAI(
            app.job_description,
            app.role ?? "",
            app.company ?? ""
          );
          allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
        }

        if (allReqs.length > 0) {
          // Score the tailored resume text (not profile achievements) against requirements
          const resumeAsAchievements: Record<string, string[]> = {
            "Tailored Resume": content.split("\n").filter((l) => l.trim().length > 0),
          };

          const resumeMatches = await scoreRequirementsWithAI(
            allReqs,
            resumeAsAchievements,
            { role: app.role ?? undefined, company: app.company ?? undefined }
          ).catch(() => []);

          if (resumeMatches.length > 0) {
            const resumeScore = calculateOverallScore(resumeMatches);
            resumeMatchPct = resumeScore.match_percentage;
            resumeGaps = resumeMatches
              .filter((m) => m.match_type === "gap")
              .map((m) => m.requirement);
          }
        }

        // Store resume match score separately
        if (resumeMatchPct != null) {
          await supabase
            .from("match_scores")
            .update({
              resume_match_percentage: resumeMatchPct,
              resume_gaps: resumeGaps,
            })
            .eq("application_id", app.id);
        }
      } catch (e) {
        console.error("Resume scoring error (non-fatal):", e);
      }
    }

    // --- ATS keyword check (literal string matching) ---
    let atsResult: { ats_score: number; missing: string[]; keywords: { keyword: string; found: boolean; category: string }[] } | null = null;
    if (app.job_description) {
      const atsCheck = checkAtsKeywords(content, app.job_description);
      atsResult = {
        ats_score: atsCheck.ats_score,
        missing: atsCheck.missing,
        keywords: atsCheck.keywords,
      };

      await supabase
        .from("match_scores")
        .update({
          ats_score: atsCheck.ats_score,
          ats_missing: atsCheck.missing,
          ats_keywords: atsCheck.keywords,
        })
        .eq("application_id", app.id);
    }

    // Job score: achievement-based (existing logic)
    let jobMatchPct = score?.match_percentage ?? null;
    if (jobMatchPct == null && score) {
      const strong = score.strong_count ?? 0;
      const partial = score.partial_count ?? 0;
      const total = strong + partial + (score.gap_count ?? 0);
      if (total > 0) {
        jobMatchPct = Math.round(((strong + partial * 0.5) / total) * 1000) / 10;
      }
    }

    return NextResponse.json({
      resume: content,
      match_percentage: jobMatchPct,
      resume_match_percentage: resumeMatchPct,
      resume_gaps: resumeGaps,
      ats_score: atsResult?.ats_score ?? null,
      ats_missing: atsResult?.missing ?? [],
      ats_keywords: atsResult?.keywords ?? [],
      match_overall: score?.overall ?? null,
    });
  } catch (err) {
    if (err instanceof ApplicationQuotaExceededError) {
      return NextResponse.json(
        { error: "Application quota exceeded", used: err.used, cap: err.cap },
        { status: 429 }
      );
    }
    console.error("Tailor resume error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
