import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage, SpendCapExceededError } from "@/lib/anthropic";
import { buildCoverLetterPrompt } from "@/ai/generate-cover-letter";

const coverLetterSchema = z.object({
  application_id: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const parsed = coverLetterSchema.safeParse(body);

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

    // Load profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, achievements, narrative")
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

    const achievements = (profile.achievements ?? [])
      .map(
        (cat: { category: string; items: { text: string }[] }) =>
          `## ${cat.category}\n${cat.items.map((i) => `- ${i.text}`).join("\n")}`
      )
      .join("\n\n");

    const prompt = buildCoverLetterPrompt({
      company: app.company,
      role: app.role,
      jobDescription: app.job_description ?? "",
      strongMatches: (score?.requirements_matched ?? []).map(
        (r: { requirement: string }) => r.requirement
      ),
      gaps: score?.gaps ?? [],
      addressableGaps: score?.addressable_gaps ?? [],
      achievements,
      narrative: profile.narrative ?? "",
      candidateName: profile.full_name,
    });

    const response = await createTrackedMessage(
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      },
      "cover_letter"
    );

    const content =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Update application
    await supabase
      .from("applications")
      .update({
        cover_letter: content,
      })
      .eq("id", app.id);

    return NextResponse.json({ cover_letter: content });
  } catch (err) {
    if (err instanceof SpendCapExceededError) {
      return NextResponse.json(
        { error: "Monthly AI spend cap exceeded", cap: err.cap },
        { status: 429 }
      );
    }
    console.error("Cover letter error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
