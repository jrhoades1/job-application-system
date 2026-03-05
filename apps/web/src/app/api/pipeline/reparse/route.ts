import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { extractJobsFromEmail } from "@/lib/extract-jobs";

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
      .eq("clerk_user_id", userId);

    const existingUids = new Set(
      (allLeads ?? []).map((l) => l.email_uid)
    );

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
        red_flags: [],
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
