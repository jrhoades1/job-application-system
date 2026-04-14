import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as cheerio from "cheerio";
import { z } from "zod";
import {
  JD_SELECTORS,
  TITLE_SELECTORS,
  COMPANY_SELECTORS,
  extractFromJsonLd,
  extractWithSelectors,
  extractDescription,
  inferSourceFromUrl,
  isPrivateUrl,
} from "@/lib/scrape-helpers";

// Mirrors looksLikeRealJd in lead-detail-sheet.tsx. Rejects text that is too
// short or lacks JD signals (login walls, CAPTCHA pages, 404s).
function looksLikeRealJd(text: string): boolean {
  if (!text || text.length < 200) return false;
  const headerLines = (text.match(/(?:^|\n)(?:From|Sent|To|Subject|Date|Cc):\s/gi) ?? []).length;
  if (headerLines >= 3) return false;
  const jdSignals = [
    /responsibilit/i, /requirement/i, /qualificat/i, /experience/i,
    /duties/i, /what you['']ll (?:do|bring)/i, /we['']re looking for/i,
    /must have/i, /years? of/i, /bachelor|master|degree/i,
  ];
  return jdSignals.filter((p) => p.test(text)).length >= 2;
}

const scrapeRequestSchema = z.object({
  url: z.string().url("Invalid URL"),
});

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = scrapeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid URL", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url } = parsed.data;

    if (isPrivateUrl(url)) {
      return NextResponse.json(
        { error: "URL not allowed" },
        { status: 400 }
      );
    }

    // LinkedIn blocks unauthenticated bots and returns a sign-in wall instead of
    // the real JD. Any "successful" scrape would just be login-page boilerplate,
    // which then poisons description_text and the score. Force the Chrome
    // extension path for LinkedIn — it captures the rendered DOM from a logged-in
    // session.
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
        return NextResponse.json(
          {
            error:
              "LinkedIn JDs must be captured via the Chrome extension. Open the posting and use Import Job.",
          },
          { status: 422 }
        );
      }
    } catch {
      // URL already validated by zod; unreachable
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch page (${response.status})` },
        { status: 422 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return NextResponse.json(
        { error: "URL did not return an HTML page" },
        { status: 422 }
      );
    }

    const html = await response.text();

    if (html.length > 2_000_000) {
      return NextResponse.json(
        { error: "Page too large to parse" },
        { status: 422 }
      );
    }

    const $ = cheerio.load(html);

    const jsonLd = extractFromJsonLd($);

    const title = jsonLd.title || extractWithSelectors($, TITLE_SELECTORS);
    const company = jsonLd.company || extractWithSelectors($, COMPANY_SELECTORS);
    const description =
      jsonLd.description || extractDescription($, JD_SELECTORS);
    const source = inferSourceFromUrl(url);

    const cleanDescription = description
      ? cheerio.load(description).text().trim()
      : undefined;

    // Sanity check: reject output that doesn't look like a real JD. Sites that
    // block scrapers often return login walls or CAPTCHA pages that are >100
    // chars but contain zero JD signals. Saving that text poisons description_text.
    if (cleanDescription && !looksLikeRealJd(cleanDescription)) {
      return NextResponse.json(
        {
          error:
            "The page returned content that doesn't look like a job description (likely a login wall or anti-bot page). Capture it via the Chrome extension instead.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      company: company || "",
      role: title || "",
      description: cleanDescription
        ? cleanDescription.slice(0, 50000)
        : "",
      source,
      source_url: url,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Request timed out — the page took too long to load" },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: "Failed to scrape job listing" },
      { status: 500 }
    );
  }
}
