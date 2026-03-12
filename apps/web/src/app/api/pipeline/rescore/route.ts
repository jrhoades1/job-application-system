import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import {
  extractRequirementsWithAI,
  requirementsFromRoleTitle,
} from "@/lib/extract-requirements-ai";
import {
  extractRequirements,
  scoreRequirement,
  calculateOverallScore,
} from "@/scoring";

const rescoreSchema = z.object({
  id: z.string().uuid(),
});

/**
 * POST /api/pipeline/rescore
 *
 * Rescore a single pipeline lead using AI requirement extraction.
 *
 * Body: { id: string }
 */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json().catch(() => ({}));
    const parsed = rescoreSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Lead ID is required" },
        { status: 400 }
      );
    }

    const { id } = parsed.data;

    // Fetch the lead
    const { data: lead, error } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .single();

    if (error || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const text = lead.description_text ?? "";

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

    // Try regex first, fall back to AI
    const reqs = extractRequirements(text);
    let allReqs = [...reqs.hard_requirements, ...reqs.preferred];
    let redFlags = reqs.red_flags;

    if (allReqs.length === 0 && text.length > 200) {
      const aiReqs = await extractRequirementsWithAI(
        text,
        lead.role ?? "",
        lead.company ?? ""
      );
      allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
      redFlags = [...redFlags, ...aiReqs.red_flags];
    }

    // Last resort: infer requirements from role title (free, no AI call)
    if (allReqs.length === 0 && lead.role) {
      allReqs = requirementsFromRoleTitle(lead.role);
    }

    if (allReqs.length === 0 && text.length > 200) {
      return NextResponse.json({
        rescored: false,
        message: "Could not extract any requirements from this lead.",
      });
    }

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
      .eq("id", id)
      .eq("clerk_user_id", userId);

    return NextResponse.json({
      rescored: true,
      score: {
        overall: score.overall,
        match_percentage: score.match_percentage,
        strong_count: score.strong_count,
        partial_count: score.partial_count,
        gap_count: score.gap_count,
      },
    });
  } catch (err) {
    console.error("Rescore error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
