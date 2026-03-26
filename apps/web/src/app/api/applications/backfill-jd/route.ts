import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { scrapeJobDescription } from "@/lib/scrape-job-url";

/**
 * POST /api/applications/backfill-jd
 *
 * One-time backfill that fixes two problems:
 *
 * 1. Garbage JDs — raw email body stored as job_description. Replaced with
 *    real JD from matching lead, scraped URL, or cleared to null.
 *
 * 2. Notification roles — subjects like "New Opportunity Alert!" stored as
 *    the role. Replaced with real role from matching lead or scrape, or
 *    marked "Unknown Role".
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

/** Detect notification/alert subjects that are NOT real job titles */
const NOTIFICATION_ROLE_PATTERNS = [
  /new\s+opportunit(?:y|ies)\s+alert/i,
  /a\s+job\s+that\s+matches/i,
  /jobs?\s+(?:you\s+might|for\s+you|matching|alert)/i,
  /new\s+jobs?\s+(?:for|posted|available)/i,
  /your\s+(?:daily|weekly)\s+job/i,
  /recommended\s+jobs?/i,
  /we\s+(?:found|identified|have)\s+a?\s*(?:new\s+)?(?:job|match|opportunit)/i,
  /profile\s+(?:just\s+)?posted/i,
  /you\s+have\s+\d+\s+new/i,
  /job\s+recommendations?/i,
];

function isNotificationRole(role: string): boolean {
  return NOTIFICATION_ROLE_PATTERNS.some((p) => p.test(role));
}

export const maxDuration = 300;

export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Fetch all applications
    const { data: apps, error } = await supabase
      .from("applications")
      .select("id, company, role, job_description, source_url, email_uid")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const allApps = apps ?? [];

    // Find apps with garbage JDs
    const garbageJdApps = allApps.filter(
      (a) => a.job_description && isEmailGarbage(a.job_description)
    );

    // Find apps with missing JDs (null or empty)
    const missingJdApps = allApps.filter(
      (a) => !a.job_description || a.job_description.trim().length === 0
    );

    // Find apps with notification subjects as roles
    const badRoleApps = allApps.filter(
      (a) => a.role && isNotificationRole(a.role)
    );

    // Combine into unique set of apps that need fixing
    const appsToFix = new Map<string, (typeof allApps)[number]>();
    for (const a of [...garbageJdApps, ...missingJdApps, ...badRoleApps]) {
      appsToFix.set(a.id, a);
    }

    if (appsToFix.size === 0) {
      return NextResponse.json({
        message: "No applications need fixing",
        checked: allApps.length,
        fixed: 0,
      });
    }

    // Load pipeline_leads for matching
    const { data: leads } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text, career_page_url")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null);

    const allLeads = leads ?? [];
    const norm = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    const results: Array<{
      id: string;
      company: string;
      role: string;
      fixes: string[];
    }> = [];

    for (const app of appsToFix.values()) {
      const hasGarbageJd = app.job_description && isEmailGarbage(app.job_description);
      const hasMissingJd = !app.job_description || app.job_description.trim().length === 0;
      const needsJdFix = hasGarbageJd || hasMissingJd;
      const hasBadRole = app.role && isNotificationRole(app.role);
      const fixes: string[] = [];
      const updates: Record<string, unknown> = {};

      // Try to find a matching lead (by company, fuzzy)
      const leadMatch = allLeads.find((l) => {
        const companyMatch =
          norm(l.company ?? "") === norm(app.company ?? "") ||
          norm(l.company ?? "").includes(norm(app.company ?? "")) ||
          norm(app.company ?? "").includes(norm(l.company ?? ""));
        // For bad-role apps, we can't match by role — match by company only
        if (hasBadRole) return companyMatch;
        return companyMatch && norm(l.role ?? "") === norm(app.role ?? "");
      });

      // Fix garbage or missing JD
      if (needsJdFix) {
        const leadJd = leadMatch?.description_text;
        const leadJdClean =
          leadJd && leadJd.length > 50 && !isEmailGarbage(leadJd);

        if (leadJdClean) {
          updates.job_description = leadJd;
          updates.source_url = leadMatch?.career_page_url ?? app.source_url;
          fixes.push("jd_from_lead");
        } else {
          // Try scraping
          const urlToScrape =
            app.source_url || leadMatch?.career_page_url || null;
          if (urlToScrape) {
            const scraped = await scrapeJobDescription(urlToScrape);
            if (scraped?.description && scraped.description.length > 100) {
              updates.job_description = scraped.description;
              updates.source_url = urlToScrape;
              fixes.push("jd_scraped");
            } else {
              fixes.push(hasMissingJd ? "jd_still_missing" : "jd_cleared");
              if (hasGarbageJd) updates.job_description = null;
            }
          } else {
            fixes.push(hasMissingJd ? "jd_still_missing_no_url" : "jd_cleared");
            if (hasGarbageJd) updates.job_description = null;
          }
        }
      }

      // Fix bad role
      if (hasBadRole) {
        if (leadMatch?.role && !isNotificationRole(leadMatch.role)) {
          updates.role = leadMatch.role;
          fixes.push(`role_from_lead:${leadMatch.role}`);
        } else {
          // Try scraping for title
          const urlToScrape =
            app.source_url || leadMatch?.career_page_url || null;
          if (urlToScrape) {
            // scrapeJobDescription doesn't return title, but we can use
            // the lead's role if available. Otherwise mark unknown.
            updates.role = "Unknown Role";
            fixes.push("role_unknown");
          } else {
            updates.role = "Unknown Role";
            fixes.push("role_unknown");
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("applications")
          .update(updates)
          .eq("id", app.id)
          .eq("clerk_user_id", userId);
      }

      results.push({
        id: app.id,
        company: app.company,
        role: app.role,
        fixes,
      });
    }

    return NextResponse.json({
      checked: allApps.length,
      total_fixed: appsToFix.size,
      garbage_jds: garbageJdApps.length,
      missing_jds: missingJdApps.length,
      bad_roles: badRoleApps.length,
      details: results,
    });
  } catch (err) {
    console.error("Backfill JD error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
