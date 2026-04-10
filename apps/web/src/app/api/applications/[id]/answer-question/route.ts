import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage, ApplicationQuotaExceededError } from "@/lib/anthropic";
import { buildAnswerQuestionPrompt } from "@/ai/answer-question";

const answerSchema = z.object({
  question: z.string().min(5, "Question must be at least 5 characters").max(2000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const parsed = answerSchema.safeParse(body);

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
      .eq("id", id)
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

    const prompt = buildAnswerQuestionPrompt({
      company: app.company,
      role: app.role,
      jobDescription: app.job_description ?? "",
      question: parsed.data.question,
      strongMatches: (score?.requirements_matched ?? []).map(
        (r: { requirement: string }) => r.requirement
      ),
      gaps: score?.gaps ?? [],
      addressableGaps: score?.addressable_gaps ?? [],
      achievements,
      narrative: profile.narrative ?? "",
      candidateName: profile.full_name,
      existingNotes: app.notes ?? "",
    });

    const response = await createTrackedMessage(
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      },
      "answer_question",
      id
    );

    const content =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ answer: content });
  } catch (err) {
    if (err instanceof ApplicationQuotaExceededError) {
      return NextResponse.json(
        { error: "Application quota exceeded", used: err.used, cap: err.cap },
        { status: 429 }
      );
    }
    console.error("Answer question error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
