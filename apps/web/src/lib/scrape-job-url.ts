import * as cheerio from "cheerio";
import {
  JD_SELECTORS,
  extractFromJsonLd,
  extractDescription,
  isPrivateUrl,
} from "@/lib/scrape-helpers";

/**
 * Scrape a job listing URL and return the description text.
 * Returns null if scraping fails or URL is invalid.
 * Lightweight version of /api/scrape-job for internal use.
 */
export async function scrapeJobDescription(
  url: string
): Promise<{ description: string; salary?: string } | null> {
  try {
    if (!url || isPrivateUrl(url)) return null;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    )
      return null;

    const html = await response.text();
    if (html.length > 2_000_000) return null;

    const $ = cheerio.load(html);
    const jsonLd = extractFromJsonLd($);

    const rawDesc = jsonLd.description || extractDescription($, JD_SELECTORS);
    if (!rawDesc) return null;

    const description = cheerio.load(rawDesc).text().trim().slice(0, 10000);
    if (description.length < 20) return null;

    return { description };
  } catch {
    return null;
  }
}
