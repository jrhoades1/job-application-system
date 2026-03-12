import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { extractRequirementsWithAI } from "@/lib/extract-requirements-ai";
import {
  extractRequirements,
  scoreRequirement,
  calculateOverallScore,
} from "@/scoring";

/**
 * POST /api/pipeline/rescore
 *
 * Backfill scores on existing pipeline leads that have 0% match.
 * Uses AI requirement extraction for leads where regex parsing found nothing.
 *
 * Body: { status?: string } — optional filter (default: all non-deleted leads)
 */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json().catch(() => ({}));
    const statusFilter = typeof body?.status === "string" ? body.status : null;

    // Load profile achievements
    const { data: profile } = await supabase
      .from("profiles")
      .select("achievements")
      .eq("clerk_user_id", userId)
      .single();

    const achievementsMap: Record<string, string[]> = {};
    const achievements = profile?.achievements ?? [];
    if (Array.isArray(achievements)) {
      for (const cat of achievements as {
        category: string;
        items: { text: string }[];
      }[]) {
        if (cat.category && Array.isArray(cat.items)) {
          achievementsMap[cat.category] = cat.items.map((i) => i.text);
        }
      }
    }

    // Find leads with zero scores that have description text
    let query = supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text, score_match_percentage")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .not("description_text", "is", null);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    // Only rescore leads with 0% or null scores
    query = query.or(
      "score_match_percentage.is.null,score_match_percentage.eq.0"
    );

    const { data: leads, error } = await query.limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        rescored: 0,
        message: "No leads need rescoring.",
      });
    }

    let rescored = 0;
    let failed = 0;

    for (const lead of leads) {
      const text = lead.description_text ?? "";
      if (text.length < 50) continue;

      try {
        const reqs = extractRequirements(text);
        let allReqs = [...reqs.hard_requirements, ...reqs.preferred];
        let redFlags = reqs.red_flags;

        if (allReqs.length === 0) {
          const aiReqs = await extractRequirementsWithAI(
            text,
            lead.role ?? "",
            lead.company ?? ""
          );
          allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
          redFlags = [...redFlags, ...aiReqs.red_flags];
        }

        if (allReqs.length === 0) continue; // Still nothing — skip

        const matches = allReqs.map((r) =>
          scoreRequirement(r, achievementsMap)
        );
        const score = calculateOverallScore(matches);

        await supabase
          .from("pipeline_leads")
          .update({
            score_overall: score.overall,
            score_match_percentage: score.match_percentage,
            score_details: {
              strong_count: score.strong_count,
              partial_count: score.partial_count,
              gap_count: score.gap_count,
            },
            red_flags: redFlags,
          })
          .eq("id", lead.id)
          .eq("clerk_user_id", userId);

        rescored++;
      } catch (err) {
        console.error(`Rescore failed for lead ${lead.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      rescored,
      failed,
      message: `Rescored ${rescored} lead${rescored !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}.`,
    });
  } catch (err) {
    console.error("Rescore error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
