import { NextResponse } from "next/server";
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

/** Known multi-job digest platforms */
const DIGEST_PLATFORMS = new Set([
  "linkedin", "indeed", "glassdoor", "ziprecruiter", "handshake",
  "ladders", "built in",
]);

function isDigestLead(platform: string | null, text: string): boolean {
  if (platform && DIGEST_PLATFORMS.has(platform.toLowerCase())) return true;
  if (!text || text.length < 100) return false;
  const lower = text.toLowerCase();
  const digestPatterns = [
    "jobs for you", "job alert", "job opportunities",
    "new jobs matching", "recommended jobs",
    "jobs that may interest you", "jobs you might like",
  ];
  return digestPatterns.some((p) => lower.includes(p));
}

/**
 * POST /api/pipeline/rescore-all
 *
 * Bulk rescore: re-scores pipeline leads. By default only upgrades leads
 * with old count-only score_details. Pass ?force=true to rescore ALL leads
 * (e.g. after updating profile achievements).
 */
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    // Fetch scored leads (non-deleted) for this user
    let query = supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text, raw_subject, source_platform, score_details, score_overall")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null);

    if (!force) {
      query = query.not("score_overall", "is", null);
    }

    const { data: leads, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: "No leads found", rescored: 0 });
    }

    // Unless force, filter to leads that need upgrading
    const needsUpgrade = force
      ? leads
      : leads.filter((lead) => {
          const details = lead.score_details as Record<string, unknown> | null;
          if (!details) return true;
          return !Array.isArray(details.strengths);
        });

    if (needsUpgrade.length === 0) {
      return NextResponse.json({ message: "All leads already have rich details", rescored: 0 });
    }

    // Load profile achievements once
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

    let rescored = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const lead of needsUpgrade) {
      try {
        const text = lead.description_text ?? "";
        const digest = isDigestLead(lead.source_platform, text);

        let allReqs: string[] = [];

        if (digest) {
          if (lead.role) {
            allReqs = requirementsFromRoleTitle(lead.role);
          }
        } else {
          const reqs = extractRequirements(text);
          allReqs = [...reqs.hard_requirements, ...reqs.preferred];

          if (allReqs.length === 0 && text.length > 200) {
            const aiReqs = await extractRequirementsWithAI(
              text,
              lead.role ?? "",
              lead.company ?? ""
            );
            allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
          }

          if (allReqs.length === 0 && lead.role) {
            allReqs = requirementsFromRoleTitle(lead.role);
          }
        }

        if (allReqs.length === 0) {
          skipped++;
          continue;
        }

        const matches = allReqs.map((r) =>
          scoreRequirement(r, achievementsMap)
        );
        const score = calculateOverallScore(matches);

        const strengths = matches
          .filter((m) => m.match_type === "strong")
          .map((m) => m.requirement);
        const partials = matches
          .filter((m) => m.match_type === "partial")
          .map((m) => m.requirement);
        const gaps = matches
          .filter((m) => m.match_type === "gap")
          .map((m) => m.requirement);

        await supabase
          .from("pipeline_leads")
          .update({
            score_overall: score.overall,
            score_match_percentage: score.match_percentage,
            score_details: {
              strong_count: score.strong_count,
              partial_count: score.partial_count,
              gap_count: score.gap_count,
              strengths,
              partials,
              gaps,
            },
            red_flags: digest ? [] : undefined,
          })
          .eq("id", lead.id)
          .eq("clerk_user_id", userId);

        rescored++;
      } catch (err) {
        errors.push(`${lead.company}/${lead.role}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      message: `Rescored ${rescored} leads`,
      rescored,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      total_checked: needsUpgrade.length,
    });
  } catch (err) {
    console.error("Rescore-all error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
