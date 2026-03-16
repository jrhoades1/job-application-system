import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage } from "@/lib/anthropic";
import { scrapeJobDescription } from "@/lib/scrape-job-url";

/**
 * POST /api/pipeline/backfill-descriptions
 *
 * One-time migration: finds leads whose description_text contains
 * the full digest email body (or is a bare title stub). Extracts
 * job URLs from the original email, scrapes each one, and updates
 * description_text with the actual job posting content.
 */
export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Find leads that need backfilling:
    // - Have digest email body (long text with "view details", "jobs for you", etc.)
    // - Or are bare stubs like "Role at Company"
    const { data: leads, error } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, location, email_uid, description_text, source_platform, career_page_url")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .not("description_text", "is", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return NextResponse.json({ updated: 0, message: "No leads to process." });
    }

    // Identify leads that need fixing
    const needsBackfill = leads.filter((l) => {
      const text = (l.description_text ?? "").toLowerCase();
      // Bare stub like "VP of Engineering at Rezilient Health"
      if (text.length < 150) return true;
      // Full digest email body
      return (
        text.includes("here are today") ||
        text.includes("jobs for you") ||
        text.includes("job alert") ||
        text.includes("recommended for you") ||
        text.includes("jobs matching") ||
        text.includes("new jobs") ||
        text.includes("jobs you might") ||
        text.includes("view details")
      );
    });

    if (needsBackfill.length === 0) {
      return NextResponse.json({
        updated: 0,
        message: "No leads need backfilling.",
      });
    }

    // Group leads by base email_uid to process each digest email once
    const groups = new Map<string, typeof needsBackfill>();
    for (const lead of needsBackfill) {
      const base = lead.email_uid?.replace(/_\d+$/, "") ?? lead.id;
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push(lead);
    }

    let updated = 0;
    let scraped = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [baseUid, groupLeads] of groups) {
      // Find the original email body (the longest description_text in the group)
      const emailBody = groupLeads.reduce(
        (longest, l) =>
          (l.description_text?.length ?? 0) > longest.length
            ? l.description_text!
            : longest,
        ""
      );

      // Step 1: Extract URLs from the email body for each job
      let jobUrls: { company: string; role: string; url: string | null }[] = [];
      if (emailBody.length > 200) {
        try {
          const response = await createTrackedMessage(
            {
              model: "claude-haiku-4-5-20251001",
              max_tokens: 4000,
              messages: [
                {
                  role: "user",
                  content: `Extract the job listing URLs from this email. For each job, find its "View Details", "Apply", or direct job link.

Return a JSON array with "company", "role", and "url" for each job. The URL should be the direct link to the job posting page (even if it's a tracking/redirect URL).

Jobs to find:
${groupLeads.map((l) => `- ${l.company}: ${l.role}`).join("\n")}

Email body (look for href attributes and links):
${emailBody.slice(0, 16000)}

Return ONLY a JSON array. Example:
[{"company": "Acme", "role": "Engineer", "url": "https://ziprecruiter.com/jobs/abc123"}]

If you can't find a URL for a job, set url to null.`,
                },
              ],
            },
            "backfill_url_extraction"
          );

          const text =
            response.content[0].type === "text" ? response.content[0].text : "";
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            jobUrls = JSON.parse(jsonMatch[0]);
          }
        } catch (err) {
          console.error(`URL extraction failed for group ${baseUid}:`, err);
        }
      }

      // Step 2: For each lead, try to scrape the job URL
      for (const lead of groupLeads) {
        try {
          // Find URL from extraction, or use existing career_page_url
          const urlMatch = jobUrls.find(
            (j) =>
              j.company?.toLowerCase() === lead.company?.toLowerCase() &&
              j.role?.toLowerCase() === lead.role?.toLowerCase()
          );
          const jobUrl = urlMatch?.url || lead.career_page_url;

          if (jobUrl) {
            const result = await scrapeJobDescription(jobUrl);
            if (result?.description) {
              await supabase
                .from("pipeline_leads")
                .update({
                  description_text: result.description,
                  career_page_url: jobUrl,
                })
                .eq("id", lead.id);
              updated++;
              scraped++;
              continue;
            }
          }

          // Scraping failed or no URL — leave a clean stub instead of digest body
          if ((lead.description_text?.length ?? 0) > 200) {
            const stub = `${lead.role} at ${lead.company}${lead.location ? ` — ${lead.location}` : ""}`;
            await supabase
              .from("pipeline_leads")
              .update({
                description_text: stub,
                career_page_url: jobUrl || null,
              })
              .eq("id", lead.id);
            updated++;
          } else {
            skipped++;
          }
        } catch (err) {
          console.error(`Backfill failed for lead ${lead.id}:`, err);
          errors.push(lead.id);
          skipped++;
        }
      }
    }

    return NextResponse.json({
      updated,
      scraped,
      skipped,
      groups_processed: groups.size,
      total_leads: needsBackfill.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Updated ${updated} leads (${scraped} scraped from job pages) across ${groups.size} emails.`,
    });
  } catch (err) {
    console.error("Backfill error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
