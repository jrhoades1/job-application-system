import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import {
  extractRequirements,
  scoreRequirement,
  scoreRequirementsWithAI,
  calculateOverallScore,
} from "@/scoring";
import { extractRequirementsWithAI } from "@/lib/extract-requirements-ai";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { id } = await params;

    // Load application
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("id, company, role, job_description")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .single();

    if (appError || !app) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!app.job_description) {
      return NextResponse.json(
        { error: "No job description available to score" },
        { status: 400 }
      );
    }

    // Load user achievements
    const { data: profile } = await supabase
      .from("profiles")
      .select("achievements")
      .eq("clerk_user_id", userId)
      .single();

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

    // Extract requirements — regex first, AI fallback for paragraph-style JDs
    const requirements = extractRequirements(app.job_description);
    let allReqs = [...requirements.hard_requirements, ...requirements.preferred];
    let redFlags = requirements.red_flags;

    if (allReqs.length === 0 && app.job_description.length > 200) {
      const aiReqs = await extractRequirementsWithAI(
        app.job_description,
        app.role ?? "",
        app.company ?? ""
      );
      allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
      redFlags = [...redFlags, ...aiReqs.red_flags];
    }

    // Score — AI first, word-overlap fallback
    let matches = await scoreRequirementsWithAI(allReqs, achievementsMap, {
      role: app.role ?? undefined,
      company: app.company ?? undefined,
    }).catch(() => []);

    if (matches.length === 0) {
      matches = allReqs.map((req) => scoreRequirement(req, achievementsMap));
    }

    const score = calculateOverallScore(matches);

    // Upsert match_scores (application_id has UNIQUE constraint)
    const { error: upsertError } = await supabase
      .from("match_scores")
      .upsert(
        {
          application_id: app.id,
          clerk_user_id: userId,
          overall: score.overall,
          match_percentage: score.match_percentage,
          strong_count: score.strong_count,
          partial_count: score.partial_count,
          gap_count: score.gap_count,
          red_flags: redFlags,
        },
        { onConflict: "application_id" }
      );

    if (upsertError) {
      console.error("Score upsert error:", upsertError);
      return NextResponse.json({ error: "Failed to save score" }, { status: 500 });
    }

    return NextResponse.json({
      overall: score.overall,
      match_percentage: score.match_percentage,
      strong_count: score.strong_count,
      partial_count: score.partial_count,
      gap_count: score.gap_count,
      red_flags: redFlags,
    });
  } catch (err) {
    console.error("Score error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
