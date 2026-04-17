/**
 * iCIMS vendor scanner.
 *
 * iCIMS tenants vary wildly in public markup: some serve a native HTML jobs
 * list, some proxy through to the customer's WordPress / SPA shell, some are
 * auth-gated. There is no stable public JSON endpoint (iCIMS's documented
 * Job Portal API requires customer OAuth per tenant).
 *
 * Strategy:
 *   1. Try to extract jobs via regex from `/jobs/search?ss=1`.
 *   2. If fewer than 3 jobs come back OR no job anchors are present at all,
 *      fall back to LLM extraction on the fetched HTML.
 *   3. If the page 401/403s, raise IcimsAuthError so the cron marks the
 *      target as auth-gated.
 *
 * identifier: the iCIMS subdomain slug (e.g. "hcsgcorp" for
 * careers-hcsgcorp.icims.com). Matches the existing detectVendor regex.
 */

import type { JobListing, ScanContext } from "../types";
import { extractJobsFromHtml } from "../llm-extract";

const FETCH_TIMEOUT_MS = 15_000;
const MIN_DIRECT_EXTRACTION = 3;

export class IcimsAuthError extends Error {
  name = "IcimsAuthError" as const;
}

interface ParsedIcimsJob {
  externalId: string;
  title: string;
  url: string;
  location?: string;
}

/**
 * Extract jobs via regex from iCIMS HTML. iCIMS job detail pages look like
 *   https://careers-{slug}.icims.com/jobs/{jobId}/{role-slug}/job
 * Search results carry <a href="..."> to those URLs with title text inside.
 */
function parseJobsFromHtml(html: string, slug: string): ParsedIcimsJob[] {
  const out: ParsedIcimsJob[] = [];
  const hostPattern = `careers-${slug}\\.icims\\.com`;
  const anchorRe = new RegExp(
    `<a[^>]+href="(?:https?:\\/\\/${hostPattern})?(\\/jobs\\/(\\d+)\\/[^"#?]+)(?:[?#][^"]*)?"[^>]*>([\\s\\S]*?)<\\/a>`,
    "gi"
  );
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const path = m[1];
    const externalId = m[2];
    const inner = m[3];
    if (seen.has(externalId)) continue;

    // Strip HTML tags to get the visible text, then take the first non-trivial line as the title.
    const visible = inner
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (visible.length < 3 || /^(?:apply|view|details|more)$/i.test(visible)) {
      continue;
    }
    const title = visible.slice(0, 200);

    seen.add(externalId);
    out.push({
      externalId,
      title,
      url: `https://careers-${slug}.icims.com${path}`,
    });
  }
  return out;
}

export async function scanIcims(
  identifier: string,
  context?: ScanContext
): Promise<JobListing[]> {
  const slug = identifier.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`Invalid iCIMS identifier: ${identifier}`);
  }

  const baseUrl = `https://careers-${slug}.icims.com`;
  const searchUrl = `${baseUrl}/jobs/search?ss=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  let html: string;
  try {
    res = await fetch(searchUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/html" },
    });
    if (res.status === 401 || res.status === 403) {
      throw new IcimsAuthError("Auth required -- remove this target");
    }
    if (!res.ok) {
      throw new Error(`iCIMS returned ${res.status} for ${slug}`);
    }
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  // Secondary auth detection: some iCIMS boards 200 but render a login form.
  if (
    /<form[^>]*(?:login|sign.?in)/i.test(html) &&
    !/jobs\/\d+\//.test(html)
  ) {
    throw new IcimsAuthError("Auth required -- remove this target");
  }

  const direct = parseJobsFromHtml(html, slug);

  if (direct.length >= MIN_DIRECT_EXTRACTION) {
    return direct.map((j) => ({
      externalId: j.externalId,
      title: j.title,
      url: j.url,
      location: j.location,
    }));
  }

  // Fallback to LLM extraction when direct parse is weak/empty.
  if (context?.allowLlmFallback && context.supabase && context.userId) {
    return extractJobsFromHtml(
      html,
      slug,
      baseUrl,
      context.supabase,
      context.userId
    );
  }

  // LLM fallback disabled and direct extraction was weak -- return what we
  // got (may be empty). Cron records a successful run with 0 jobs rather
  // than erroring.
  return direct.map((j) => ({
    externalId: j.externalId,
    title: j.title,
    url: j.url,
    location: j.location,
  }));
}
