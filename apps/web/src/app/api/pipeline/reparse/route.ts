import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { extractJobsFromEmail } from "@/lib/extract-jobs";
import {
  extractRequirementsWithAI,
  requirementsFromRoleTitle,
} from "@/lib/extract-requirements-ai";
import {
  extractRequirements,
  scoreRequirement,
  calculateOverallScore,
} from "@/scoring";

/**
 * POST /api/pipeline/reparse
 *
 * Re-processes a single pipeline lead that has email body content.
 * Extracts individual jobs from the description_text and creates
 * new leads for each job found.
 *
 * Body: { id: string }
 */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const leadId = body?.id;

    if (!leadId || typeof leadId !== "string") {
      return NextResponse.json(
        { error: "Lead ID is required" },
        { status: 400 }
      );
    }

    // Fetch the specific lead, verify ownership
    const { data: lead, error } = await supabase
      .from("pipeline_leads")
      .select("*")
      .eq("id", leadId)
      .eq("clerk_user_id", userId)
      .single();

    if (error || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!lead.description_text) {
      return NextResponse.json(
        { error: "This lead has no email content to reparse" },
        { status: 400 }
      );
    }

    let jobs;
    try {
      jobs = await extractJobsFromEmail(
        lead.description_text,
        lead.raw_subject ?? "",
        lead.source_platform
      );
    } catch (err) {
      console.error(`Reparse failed for lead ${lead.id}:`, err);
      return NextResponse.json(
        { error: "Failed to extract jobs from email content" },
        { status: 500 }
      );
    }

    if (jobs.length <= 1) {
      return NextResponse.json({
        new_leads: 0,
        message: "No additional jobs found in this email.",
      });
    }

    // Load existing UIDs for dedup
    const { data: allLeads } = await supabase
      .from("pipeline_leads")
      .select("email_uid")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null);

    const existingUids = new Set(
      (allLeads ?? []).map((l) => l.email_uid)
    );

    // Load profile achievements for scoring
    const { data: profile } = await supabase
      .from("profiles")
      .select("achievements")
      .eq("clerk_user_id", userId)
      .single();

    const achievementsMap: Record<string, string[]> = {};
    const achievements = profile?.achievements ?? [];
    if (Array.isArray(achievements)) {
      for (const cat of achievements as { category: string; items: { text: string }[] }[]) {
        if (cat.category && Array.isArray(cat.items)) {
          achievementsMap[cat.category] = cat.items.map((i) => i.text);
        }
      }
    }

    /** Known multi-job digest platforms */
    const DIGEST_PLATFORMS = new Set([
      "linkedin", "indeed", "glassdoor", "ziprecruiter", "handshake",
      "ladders", "built in",
    ]);

    const isDigest =
      (lead.source_platform &&
        DIGEST_PLATFORMS.has(lead.source_platform.toLowerCase())) ||
      /jobs? (for you|alert|opportunities)/i.test(lead.description_text ?? "");

    async function scoreLeadText(text: string, role: string, company: string) {
      // If this is a digest email, use role-title inference only
      if (isDigest) {
        const allReqs = role ? requirementsFromRoleTitle(role) : [];
        const matches = allReqs.map((r) => scoreRequirement(r, achievementsMap));
        const score = calculateOverallScore(matches);
        return { score, red_flags: [] as string[] };
      }

      const reqs = extractRequirements(text);
      let allReqs = [...reqs.hard_requirements, ...reqs.preferred];
      let redFlags = reqs.red_flags;

      if (allReqs.length === 0 && text.length > 50) {
        try {
          const aiReqs = await extractRequirementsWithAI(text, role, company);
          allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
          redFlags = [...redFlags, ...aiReqs.red_flags];
        } catch (err) {
          console.error("AI requirement extraction failed during reparse:", err);
        }
      }

      // Last resort: infer requirements from role title
      if (allReqs.length === 0 && role) {
        allReqs = requirementsFromRoleTitle(role);
      }

      const matches = allReqs.map((r) => scoreRequirement(r, achievementsMap));
      const score = calculateOverallScore(matches);
      return { score, red_flags: redFlags };
    }

    let newLeads = 0;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const leadUid = `${lead.email_uid}_${i}`;

      if (existingUids.has(leadUid)) continue;

      // Check if this company+role combo already exists
      const { data: dupe } = await supabase
        .from("pipeline_leads")
        .select("id")
        .eq("clerk_user_id", userId)
        .eq("company", job.company)
        .eq("role", job.role)
        .limit(1);

      if (dupe && dupe.length > 0) continue;

      const leadText = lead.description_text ?? "";
      const leadScore = await scoreLeadText(leadText, job.role, job.company);

      await supabase.from("pipeline_leads").insert({
        clerk_user_id: userId,
        company: job.company,
        role: job.role,
        location: job.location ?? null,
        source_platform: lead.source_platform,
        email_uid: leadUid,
        email_date: lead.email_date,
        raw_subject: lead.raw_subject,
        description_text: lead.description_text,
        status: "pending_review",
        score_overall: leadScore.score.overall,
        score_match_percentage: leadScore.score.match_percentage,
        score_details: {
          strong_count: leadScore.score.strong_count,
          partial_count: leadScore.score.partial_count,
          gap_count: leadScore.score.gap_count,
        },
        red_flags: leadScore.red_flags,
        created_at: new Date().toISOString(),
      });

      existingUids.add(leadUid);
      newLeads++;
    }

    // Mark original lead so it won't be reparsed again
    await supabase
      .from("pipeline_leads")
      .update({ email_uid: `${lead.email_uid}_0` })
      .eq("id", lead.id);

    return NextResponse.json({
      new_leads: newLeads,
      message: `Found ${newLeads} new lead${newLeads !== 1 ? "s" : ""} from this email.`,
    });
  } catch (err) {
    console.error("Reparse error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
