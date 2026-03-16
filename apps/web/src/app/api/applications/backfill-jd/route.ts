import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { scrapeJobDescription } from "@/lib/scrape-job-url";

/**
 * POST /api/applications/backfill-jd
 *
 * One-time backfill: finds applications whose job_description is raw email
 * garbage (forwarded headers, tracking URLs, boilerplate) and replaces them
 * with real JDs from either:
 *   1. A matching pipeline_lead that already has a clean description_text
 *   2. The source_url scraped via server-side cheerio
 *   3. null (garbage removed, awaiting Chrome extension capture)
 */

/** Detect whether a job_description is raw email garbage */
function isEmailGarbage(text: string): boolean {
  const signals = [
    /---------- Forwarded message/i,
    /From:\s*.+\n/,
    /Date:\s*.+\n/,
    /Subject:\s*.+\n/,
    /To:\s*<.+>/,
    /awstrack\.me/i,
    /brevo\./i,
    /Hello there\s*[*🖐👋✋]*/i,
    /we\s+(?:just\s+)?identified\s+a\s+brand[- ]new\s+job\s+posting/i,
    /\[image:\s*\w+\]/i,
  ];
  const hitCount = signals.filter((p) => p.test(text)).length;
  return hitCount >= 2;
}

export const maxDuration = 300;

export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Fetch all applications with a non-null job_description
    const { data: apps, error } = await supabase
      .from("applications")
      .select("id, company, role, job_description, source_url, email_uid")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .not("job_description", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter to only garbage JDs
    const garbageApps = (apps ?? []).filter(
      (a) => a.job_description && isEmailGarbage(a.job_description)
    );

    if (garbageApps.length === 0) {
      return NextResponse.json({
        message: "No applications with email garbage JDs found",
        checked: (apps ?? []).length,
        fixed: 0,
      });
    }

    // Load pipeline_leads with good description_text for matching
    const { data: leads } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text, career_page_url")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .not("description_text", "is", null);

    const goodLeads = (leads ?? []).filter(
      (l) =>
        l.description_text &&
        l.description_text.length > 300 &&
        !isEmailGarbage(l.description_text)
    );

    const results: Array<{
      id: string;
      company: string;
      role: string;
      action: string;
    }> = [];

    for (const app of garbageApps) {
      const norm = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

      // Strategy 1: Find matching lead with clean description
      const leadMatch = goodLeads.find(
        (l) =>
          norm(l.company ?? "") === norm(app.company ?? "") &&
          norm(l.role ?? "") === norm(app.role ?? "")
      );

      if (leadMatch?.description_text) {
        await supabase
          .from("applications")
          .update({
            job_description: leadMatch.description_text,
            source_url: leadMatch.career_page_url ?? app.source_url,
          })
          .eq("id", app.id)
          .eq("clerk_user_id", userId);

        results.push({
          id: app.id,
          company: app.company,
          role: app.role,
          action: "copied_from_lead",
        });
        continue;
      }

      // Strategy 2: Scrape source_url or lead's career_page_url
      const urlToScrape =
        app.source_url || leadMatch?.career_page_url || null;

      if (urlToScrape) {
        const scraped = await scrapeJobDescription(urlToScrape);
        if (scraped?.description && scraped.description.length > 100) {
          await supabase
            .from("applications")
            .update({
              job_description: scraped.description,
              source_url: urlToScrape,
            })
            .eq("id", app.id)
            .eq("clerk_user_id", userId);

          results.push({
            id: app.id,
            company: app.company,
            role: app.role,
            action: "scraped_from_url",
          });
          continue;
        }
      }

      // Strategy 3: Clear the garbage — awaiting Chrome extension capture
      await supabase
        .from("applications")
        .update({ job_description: null })
        .eq("id", app.id)
        .eq("clerk_user_id", userId);

      results.push({
        id: app.id,
        company: app.company,
        role: app.role,
        action: "cleared_garbage",
      });
    }

    const summary = {
      checked: (apps ?? []).length,
      garbage_found: garbageApps.length,
      copied_from_lead: results.filter((r) => r.action === "copied_from_lead").length,
      scraped_from_url: results.filter((r) => r.action === "scraped_from_url").length,
      cleared: results.filter((r) => r.action === "cleared_garbage").length,
      details: results,
    };

    return NextResponse.json(summary);
  } catch (err) {
    console.error("Backfill JD error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
