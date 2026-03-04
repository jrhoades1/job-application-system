import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage, SpendCapExceededError } from "@/lib/anthropic";
import { buildTailorResumePrompt } from "@/ai/tailor-resume";

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

    const prompt = buildTailorResumePrompt({
      baseResume: achievements, // Use achievements as resume base if no file
      jobDescription: app.job_description ?? "",
      company: app.company,
      role: app.role,
      matchScore: score?.overall ?? "stretch",
      keywords: score?.keywords ?? [],
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
      "tailor_resume"
    );

    const content =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Update application with content and version label
    await supabase
      .from("applications")
      .update({
        resume_version: `tailored_${new Date().toISOString().slice(0, 10)}`,
        tailored_resume: content,
      })
      .eq("id", app.id);

    // Compute match_percentage from counts if not stored (older scores)
    let matchPct = score?.match_percentage ?? null;
    if (matchPct == null && score) {
      const strong = score.strong_count ?? 0;
      const partial = score.partial_count ?? 0;
      const total = strong + partial + (score.gap_count ?? 0);
      if (total > 0) {
        matchPct = Math.round(((strong + partial * 0.5) / total) * 1000) / 10;
      }
    }

    return NextResponse.json({
      resume: content,
      match_percentage: matchPct,
      match_overall: score?.overall ?? null,
    });
  } catch (err) {
    if (err instanceof SpendCapExceededError) {
      return NextResponse.json(
        { error: "Monthly AI spend cap exceeded", cap: err.cap },
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
