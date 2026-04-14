import { SupabaseClient } from "@supabase/supabase-js";
import { extractRequirements, scoreRequirement, calculateOverallScore } from "@/scoring";

/**
 * Score a JD against the user's achievements and write score fields
 * back to the pipeline_leads row. No-op if the JD has no extractable
 * requirements (leaves existing score untouched).
 */
export async function rescoreLead(
  supabase: SupabaseClient,
  leadId: string,
  jd: string,
  userId: string,
): Promise<void> {
  const { data: profileData } = await supabase
    .from("profiles")
    .select("achievements")
    .eq("clerk_user_id", userId)
    .single();

  const profile = profileData as { achievements: unknown } | null;
  const achievementsMap: Record<string, string[]> = {};
  const achievements = profile?.achievements ?? [];
  if (Array.isArray(achievements)) {
    for (const cat of achievements as { category: string; items: { text: string }[] }[]) {
      if (cat.category && Array.isArray(cat.items)) {
        achievementsMap[cat.category] = cat.items.map((i) => i.text);
      }
    }
  }

  const reqs = extractRequirements(jd);
  const allReqs = [...reqs.hard_requirements, ...reqs.preferred];
  if (allReqs.length === 0) return;

  const matches = allReqs.map((r) => scoreRequirement(r, achievementsMap));
  const score = calculateOverallScore(matches, "scored");

  await supabase
    .from("pipeline_leads")
    .update({
      score_overall: score.overall,
      score_match_percentage: score.match_percentage,
      score_details: {
        strong_count: score.strong_count,
        partial_count: score.partial_count,
        gap_count: score.gap_count,
        score_source: "scored",
      },
      red_flags: reqs.red_flags,
    })
    .eq("id", leadId);
}
