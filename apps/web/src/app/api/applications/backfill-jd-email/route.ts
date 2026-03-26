import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { getGmailTokens, getGmailMessage, type GmailMessageFull } from "@/lib/gmail";
import { scrapeJobDescription } from "@/lib/scrape-job-url";

/**
 * POST /api/applications/backfill-jd-email
 *
 * Reprocesses original emails to backfill missing job descriptions.
 * For each application with a NULL job_description:
 *   1. Find the matching pipeline_lead
 *   2. If lead has career_page_url → scrape it
 *   3. If no URL or scrape fails → re-fetch email from Gmail → extract URLs → scrape
 *   4. Update application with scraped JD
 *
 * Auth: x-cron-secret + x-cron-user-id (same as gmail/sync)
 */

export const maxDuration = 300;

/** Extract raw HTML body from a Gmail message (needed to find <a href> links) */
function extractHtmlBody(msg: GmailMessageFull): string {
  function findHtml(part: {
    mimeType: string;
    body?: { data?: string };
    parts?: { mimeType: string; body?: { data?: string }; parts?: unknown[] }[];
  }): string {
    if (part.mimeType === "text/html" && part.body?.data) {
      const base64 = part.body.data.replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(base64, "base64").toString("utf-8");
    }
    if (part.parts) {
      for (const child of part.parts) {
        const html = findHtml(child as typeof part);
        if (html) return html;
      }
    }
    return "";
  }
  return findHtml(msg.payload);
}

/** Extract all URLs from HTML <a href="..."> tags */
function extractUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1].trim();
    if (url.startsWith("http")) {
      urls.push(url);
    }
  }
  return urls;
}

/** Also extract URLs from plain text (emails may have visible links) */
function extractUrlsFromText(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"',)]+/gi;
  return (text.match(urlRegex) ?? []).map((u) => u.replace(/[.)]+$/, ""));
}

/** Filter URLs to likely job listing pages */
function filterJobUrls(urls: string[]): string[] {
  const skipDomains = [
    "unsubscribe", "mailto:", "google.com/maps", "facebook.com",
    "twitter.com", "instagram.com", "youtube.com", "linkedin.com/in/",
    "linkedin.com/company", "linkedin.com/feed", "linkedin.com/notifications",
    "support.", "help.", "privacy", "terms", "about-us", "contact-us",
    "account/settings", "manage-preferences", "email-preferences",
  ];
  const jobSignals = [
    /linkedin\.com\/(?:comm\/)?jobs\/view/i,
    /linkedin\.com\/(?:comm\/)?job/i,
    /indeed\.com\/viewjob/i,
    /indeed\.com\/rc\/clk/i,
    /glassdoor\.com\/job/i,
    /ziprecruiter\.com\/(?:c|k|jobs)/i,
    /lever\.co\//i,
    /greenhouse\.io\/.*job/i,
    /boards\.greenhouse/i,
    /ashbyhq\.com/i,
    /apply\.workable/i,
    /careers\./i,
    /jobs\./i,
    /\/jobs?\//i,
    /\/careers?\//i,
    /\/apply/i,
    /\/position/i,
    /\/opening/i,
    /workday\.com/i,
    /myworkdayjobs\.com/i,
    /smartrecruiters\.com/i,
    /icims\.com/i,
    /jobvite\.com/i,
    /bamboohr\.com/i,
  ];

  // Dedupe
  const seen = new Set<string>();
  const unique = urls.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  return unique.filter((url) => {
    const lower = url.toLowerCase();
    // Skip obviously non-job URLs
    if (skipDomains.some((d) => lower.includes(d))) return false;
    // Prioritize known job URL patterns
    return jobSignals.some((p) => p.test(url));
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

export async function POST(req: Request) {
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const cronUserId = req.headers.get("x-cron-user-id");

    if (!cronSecret || cronSecret !== process.env.CRON_SECRET || !cronUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceRoleClient();

    // Get Gmail tokens
    const tokens = await getGmailTokens(supabase, cronUserId);
    if (!tokens) {
      return NextResponse.json({ error: "No Gmail connection" }, { status: 400 });
    }

    // Get all applications with missing JDs
    const { data: apps, error } = await supabase
      .from("applications")
      .select("id, company, role, source_url")
      .eq("clerk_user_id", cronUserId)
      .is("deleted_at", null)
      .or("job_description.is.null,job_description.eq.");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!apps || apps.length === 0) {
      return NextResponse.json({ message: "No applications with missing JDs", fixed: 0 });
    }

    // Get all pipeline_leads for matching
    const { data: leads } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text, career_page_url, email_uid")
      .eq("clerk_user_id", cronUserId)
      .is("deleted_at", null);

    const allLeads = leads ?? [];

    const results: Array<{
      id: string;
      company: string;
      role: string;
      fix: string;
      jd_length?: number;
    }> = [];

    let fixed = 0;
    let scraped = 0;
    let emailFetched = 0;

    for (const app of apps) {
      // Find matching lead
      const leadMatch = allLeads.find((l) => {
        const companyMatch =
          norm(l.company ?? "") === norm(app.company ?? "") ||
          norm(l.company ?? "").includes(norm(app.company ?? "")) ||
          norm(app.company ?? "").includes(norm(l.company ?? ""));
        const roleMatch =
          norm(l.role ?? "") === norm(app.role ?? "") ||
          norm(l.role ?? "").includes(norm(app.role ?? "")) ||
          norm(app.role ?? "").includes(norm(l.role ?? ""));
        return companyMatch && roleMatch;
      });

      // Check if lead has a valid JD we missed before
      if (leadMatch?.description_text && leadMatch.description_text.trim().length >= 50) {
        await supabase
          .from("applications")
          .update({ job_description: leadMatch.description_text.trim() })
          .eq("id", app.id);
        results.push({ id: app.id, company: app.company, role: app.role, fix: "lead_description", jd_length: leadMatch.description_text.length });
        fixed++;
        continue;
      }

      // Try scraping career_page_url or source_url
      const urlToScrape = leadMatch?.career_page_url || app.source_url;
      if (urlToScrape) {
        const result = await scrapeJobDescription(urlToScrape);
        if (result?.description && result.description.length >= 50) {
          await supabase
            .from("applications")
            .update({ job_description: result.description })
            .eq("id", app.id);
          results.push({ id: app.id, company: app.company, role: app.role, fix: "scraped_url", jd_length: result.description.length });
          fixed++;
          scraped++;
          continue;
        }
      }

      // Last resort: re-fetch email from Gmail, extract URLs, try scraping
      const emailUid = leadMatch?.email_uid;
      if (!emailUid) {
        results.push({ id: app.id, company: app.company, role: app.role, fix: "no_lead_no_email" });
        continue;
      }

      // email_uid can be "msgId_0", "msgId_1" for multi-job — extract base ID
      const baseMessageId = emailUid.replace(/_\d+$/, "");

      try {
        const msg = await getGmailMessage(tokens.access_token, baseMessageId);
        if (!msg) {
          results.push({ id: app.id, company: app.company, role: app.role, fix: "email_not_found" });
          continue;
        }
        emailFetched++;

        // Extract URLs from HTML and plain text
        const html = extractHtmlBody(msg);
        const htmlUrls = extractUrlsFromHtml(html);
        const textBody = msg.payload.body?.data
          ? Buffer.from(msg.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
          : "";
        const textUrls = extractUrlsFromText(textBody);

        const allUrls = [...htmlUrls, ...textUrls];
        const jobUrls = filterJobUrls(allUrls);

        if (jobUrls.length === 0) {
          results.push({ id: app.id, company: app.company, role: app.role, fix: "no_job_urls_in_email" });
          continue;
        }

        // Try scraping each job URL until one works
        let foundJd = false;
        for (const url of jobUrls.slice(0, 5)) {
          const result = await scrapeJobDescription(url);
          if (result?.description && result.description.length >= 50) {
            await supabase
              .from("applications")
              .update({
                job_description: result.description,
                source_url: url,
              })
              .eq("id", app.id);
            results.push({ id: app.id, company: app.company, role: app.role, fix: "scraped_from_email_url", jd_length: result.description.length });
            fixed++;
            scraped++;
            foundJd = true;
            break;
          }
        }

        if (!foundJd) {
          results.push({
            id: app.id,
            company: app.company,
            role: app.role,
            fix: "email_urls_scrape_failed",
          });
        }
      } catch (err) {
        results.push({
          id: app.id,
          company: app.company,
          role: app.role,
          fix: `email_fetch_error: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }

    return NextResponse.json({
      total_missing: apps.length,
      fixed,
      scraped,
      emails_fetched: emailFetched,
      details: results,
    });
  } catch (err) {
    console.error("Backfill JD from email error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
