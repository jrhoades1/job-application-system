import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { extractJobsFromEmail } from "@/lib/extract-jobs";

// Platforms that send multi-job digest emails
const MULTI_JOB_PLATFORMS = [
  "LinkedIn",
  "Indeed",
  "Glassdoor",
  "ZipRecruiter",
  "Handshake",
];

/**
 * POST /api/pipeline/reparse
 *
 * Re-processes existing pipeline leads from multi-job platforms.
 * Finds leads that were stored as a single entry (no _N suffix in email_uid)
 * and uses AI to extract all individual jobs from the description_text.
 */
export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Find leads from multi-job platforms that have description_text
    // and whose email_uid doesn't already have a _N suffix (not yet reparsed)
    const { data: candidates, error } = await supabase
      .from("pipeline_leads")
      .select("*")
      .eq("clerk_user_id", userId)
      .in("source_platform", MULTI_JOB_PLATFORMS)
      .not("description_text", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter to only leads that haven't been reparsed yet
    // (email_uid without _N suffix pattern)
    const unreprocessed = (candidates ?? []).filter(
      (lead) => lead.email_uid && !/_\d+$/.test(lead.email_uid)
    );

    if (unreprocessed.length === 0) {
      return NextResponse.json({
        reparsed: 0,
        new_leads: 0,
        message: "No multi-job leads to reparse.",
      });
    }

    // Load all existing UIDs for dedup
    const { data: allLeads } = await supabase
      .from("pipeline_leads")
      .select("email_uid")
      .eq("clerk_user_id", userId);

    const existingUids = new Set(
      (allLeads ?? []).map((l) => l.email_uid)
    );

    let reparsed = 0;
    let newLeads = 0;

    for (const lead of unreprocessed) {
      let jobs;
      try {
        jobs = await extractJobsFromEmail(
          lead.description_text,
          lead.raw_subject ?? "",
          lead.source_platform
        );
      } catch (err) {
        console.error(
          `Reparse failed for lead ${lead.id}:`,
          err
        );
        continue;
      }

      if (jobs.length <= 1) {
        // Single job or no jobs extracted — nothing new to add
        continue;
      }

      reparsed++;

      // Insert new leads for each extracted job (skip index 0, that's the original)
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const leadUid = `${lead.email_uid}_${i}`;

        if (existingUids.has(leadUid)) continue;

        // Check if this company+role combo already exists for this user
        // (could have been manually added)
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

      // Rename the original lead's email_uid so it won't be reparsed again
      await supabase
        .from("pipeline_leads")
        .update({ email_uid: `${lead.email_uid}_0` })
        .eq("id", lead.id);
    }

    return NextResponse.json({
      reparsed,
      new_leads: newLeads,
      message: `Reparsed ${reparsed} multi-job emails, found ${newLeads} new leads.`,
    });
  } catch (err) {
    console.error("Reparse error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
