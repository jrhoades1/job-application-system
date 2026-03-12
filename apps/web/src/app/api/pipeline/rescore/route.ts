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

/** Detect if description_text is a multi-job digest rather than a single JD */
function isDigestText(text: string): boolean {
  if (!text || text.length < 100) return false;
  const lower = text.toLowerCase();
  const digestPatterns = [
    "jobs for you",
    "job alert",
    "job opportunities",
    "new jobs matching",
    "recommended jobs",
    "jobs that may interest you",
    "jobs you might like",
    "your job alert",
  ];
  if (digestPatterns.some((p) => lower.includes(p))) return true;
  // Multiple company·location lines = digest
  const companyDots = (text.match(/·\s*\w+.*\n/g) || []).length;
  if (companyDots >= 3) return true;
  return false;
}

/** Detect if the lead text is actually a rejection email */
function isRejectionText(text: string, subject: string): boolean {
  const combined = `${subject}\n${text}`.toLowerCase();
  const patterns = [
    "we will not be moving forward",
    "decided not to move forward",
    "not moving forward",
    "we have decided to pursue other candidates",
    "position has been filled",
    "after careful consideration",
    "we regret to inform",
    "unfortunately.*not selected",
    "we appreciate your interest.*however",
    "will not be proceeding",
    "your application.*not been selected",
    "decided to go with another candidate",
    "not be advancing your application",
  ];
  return patterns.some((p) => new RegExp(p).test(combined));
}

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
      .select("id, company, role, description_text, raw_subject")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .single();

    if (error || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const text = lead.description_text ?? "";
    const subject = lead.raw_subject ?? "";

    // If this is a rejection email, soft-delete the lead
    if (isRejectionText(text, subject)) {
      await supabase
        .from("pipeline_leads")
        .update({
          status: "skipped",
          red_flags: [],
          deleted_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("clerk_user_id", userId);

      return NextResponse.json({
        rescored: false,
        rejected: true,
        message: "This lead was identified as a rejection email and has been removed.",
      });
    }

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

    const digest = isDigestText(text);

    let allReqs: string[] = [];
    let redFlags: string[] = [];

    if (digest) {
      // Digest emails: use role-title inference only (no AI on digest text)
      if (lead.role) {
        allReqs = requirementsFromRoleTitle(lead.role);
      }
    } else {
      // Single JD: try regex first, fall back to AI
      const reqs = extractRequirements(text);
      allReqs = [...reqs.hard_requirements, ...reqs.preferred];
      redFlags = reqs.red_flags;

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
    }

    if (allReqs.length === 0) {
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
      digest,
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
