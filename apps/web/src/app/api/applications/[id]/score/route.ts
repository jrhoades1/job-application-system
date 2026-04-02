import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import {
  extractRequirementsWithAI,
  requirementsFromRoleTitle,
} from "@/lib/extract-requirements-ai";
import {
  extractRequirements,
  scoreRequirement,
  scoreRequirementsWithAI,
  calculateOverallScore,
} from "@/scoring";

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

    // Score — regex extraction first, AI fallback, then role-title last resort
    const requirements = extractRequirements(app.job_description);
    let allReqs = [...requirements.hard_requirements, ...requirements.preferred];
    let redFlags = requirements.red_flags;

    // Fallback: AI extraction when regex finds nothing (e.g. unstructured JD text)
    if (allReqs.length === 0 && app.job_description.length > 200) {
      const aiReqs = await extractRequirementsWithAI(
        app.job_description,
        app.role ?? "",
        app.company ?? ""
      );
      allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
      redFlags = [...redFlags, ...aiReqs.red_flags];
    }

    // Last resort: infer from role title (free, no AI call)
    if (allReqs.length === 0 && app.role) {
      allReqs = requirementsFromRoleTitle(app.role);
    }

    let matches = await scoreRequirementsWithAI(allReqs, achievementsMap, {
      role: app.role ?? undefined,
      company: app.company ?? undefined,
    }).catch(() => []);

    if (matches.length === 0) {
      matches = allReqs.map((req) => scoreRequirement(req, achievementsMap));
    }

    const score = calculateOverallScore(matches);

    // Build rich breakdown
    const strengths = matches
      .filter((m) => m.match_type === "strong")
      .map((m) => m.requirement);
    const partials = matches
      .filter((m) => m.match_type === "partial")
      .map((m) => m.requirement);
    const gaps = matches
      .filter((m) => m.match_type === "gap")
      .map((m) => m.requirement);

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
          requirements_matched: strengths,
          requirements_partial: partials,
          gaps,
          keywords: requirements.keywords,
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
      red_flags: requirements.red_flags,
    });
  } catch (err) {
    console.error("Score error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
