import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * GET /api/admin/scoring-debug
 *
 * Debug endpoint: returns profile achievements summary and a sample lead's
 * scoring data so we can diagnose why scores are 0%.
 */
export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Check profile achievements
    const { data: profile } = await supabase
      .from("profiles")
      .select("achievements")
      .eq("clerk_user_id", userId)
      .single();

    const achievements = profile?.achievements;
    const achievementsSummary = Array.isArray(achievements)
      ? achievements.map((cat: { category: string; items: { text: string }[] }) => ({
          category: cat.category,
          count: cat.items?.length ?? 0,
          sample: cat.items?.[0]?.text?.slice(0, 80) ?? null,
        }))
      : null;

    // Get one sample lead with its scoring data
    const { data: sampleLead } = await supabase
      .from("pipeline_leads")
      .select(
        "id, company, role, score_overall, score_match_percentage, score_details, red_flags, description_text"
      )
      .eq("clerk_user_id", userId)
      .eq("status", "pending_review")
      .is("deleted_at", null)
      .limit(1)
      .single();

    return NextResponse.json({
      profile_has_achievements: !!achievementsSummary && achievementsSummary.length > 0,
      achievements_categories: achievementsSummary?.length ?? 0,
      achievements_summary: achievementsSummary,
      sample_lead: sampleLead
        ? {
            id: sampleLead.id,
            company: sampleLead.company,
            role: sampleLead.role,
            score_overall: sampleLead.score_overall,
            score_match_percentage: sampleLead.score_match_percentage,
            score_details: sampleLead.score_details,
            red_flags: sampleLead.red_flags,
            description_preview: sampleLead.description_text?.slice(0, 300) ?? null,
          }
        : null,
    });
  } catch (err) {
    console.error("Scoring debug error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
