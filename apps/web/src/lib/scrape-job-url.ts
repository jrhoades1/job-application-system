import * as cheerio from "cheerio";
import {
  JD_SELECTORS,
  extractFromJsonLd,
  extractDescription,
  isPrivateUrl,
} from "@/lib/scrape-helpers";

export type ScrapeResult =
  | { kind: "ok"; description: string; salary?: string }
  | { kind: "dead"; reason: string }
  | { kind: "error" };

const DEAD_JOB_SIGNALS = [
  /no matching jobs? found/i,
  /this job (?:is )?(?:no longer|has been) (?:available|accepting applications|posted)/i,
  /this (?:position|role|posting|job) (?:is )?(?:no longer|has been) (?:available|filled|closed)/i,
  /the (?:position|role|posting|job) you['']re looking for (?:is )?(?:no longer|has been)/i,
  /job (?:not found|has expired|posting has (?:expired|ended|closed))/i,
  /this posting has been (?:removed|filled|closed)/i,
  /sorry, this job is no longer available/i,
  /page not found/i,
];

/**
 * Scrape a job listing URL.
 *
 * Returns a discriminated union:
 *   - { kind: "ok" }    — got a usable JD
 *   - { kind: "dead" }  — confirmed posting removed/expired (LinkedIn "No matching jobs", 404, etc.)
 *   - { kind: "error" } — transient failure, could not determine
 */
export async function scrapeJobDescriptionDetailed(
  url: string
): Promise<ScrapeResult> {
  try {
    if (!url || isPrivateUrl(url)) return { kind: "error" };

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });

    // Hard 404 / 410 → definitely dead
    if (response.status === 404 || response.status === 410) {
      return { kind: "dead", reason: `HTTP ${response.status} — posting removed` };
    }
    if (!response.ok) return { kind: "error" };

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    )
      return { kind: "error" };

    const html = await response.text();
    if (html.length > 2_000_000) return { kind: "error" };

    // Check for dead-job signals in the full page text BEFORE trying to extract
    const pageText = cheerio.load(html).root().text();
    for (const pattern of DEAD_JOB_SIGNALS) {
      if (pattern.test(pageText)) {
        return { kind: "dead", reason: "Posting expired or removed" };
      }
    }

    const $ = cheerio.load(html);
    const jsonLd = extractFromJsonLd($);

    const rawDesc = jsonLd.description || extractDescription($, JD_SELECTORS);
    if (!rawDesc) return { kind: "error" };

    const description = cheerio.load(rawDesc).text().trim().slice(0, 10000);
    if (description.length < 20) return { kind: "error" };

    return { kind: "ok", description };
  } catch {
    return { kind: "error" };
  }
}

/**
 * Legacy wrapper — returns { description } or null. Existing callers that
 * don't need to distinguish "dead" from "error" can keep using this.
 */
export async function scrapeJobDescription(
  url: string
): Promise<{ description: string; salary?: string } | null> {
  const result = await scrapeJobDescriptionDetailed(url);
  if (result.kind === "ok") return { description: result.description };
  return null;
}
