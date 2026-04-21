/**
 * Radancy / TalentBrew / Magic Bullet vendor scanner.
 *
 * Radancy sites live on the company's own hostname (no shared subdomain),
 * so URL-pattern detection isn't enough. A successful addTarget probes
 * the URL for `data-company-site-id` + `tbcdn.talentbrew.com` markers,
 * then stores identifier `{hostname}/{companySiteId}`.
 *
 * Primary path: GET `/search-jobs/results?CurrentPage=N&RecordsPerPage=100`
 * returns JSON `{filters, results, hasJobs, hasContent}` where `results`
 * is an HTML chunk containing job <li> cards. We parse the chunk with
 * regex (not a full DOM) to keep deps small.
 *
 * No CSRF, no auth. Scales linearly with page count.
 */

import { z } from "zod";
import type { JobListing } from "../types";

const RESULTS_PER_PAGE = 100;
const MAX_PAGES = 100;
const FETCH_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS = 5_000;

export class RadancyAuthError extends Error {
  name = "RadancyAuthError" as const;
}

export class RadancyRateLimitError extends Error {
  name = "RadancyRateLimitError" as const;
}

const RadancyResponseSchema = z.object({
  results: z.string(),
  hasJobs: z.boolean().optional().default(true),
});

function parseIdentifier(identifier: string): {
  hostname: string;
  companySiteId: string;
} {
  const [hostname, companySiteId, ...rest] = identifier.split("/");
  if (!hostname || !companySiteId || rest.length > 0) {
    throw new Error(`Invalid Radancy identifier: ${identifier}`);
  }
  // Guard against accidental schemes smuggled in
  if (hostname.includes(":") || hostname.includes(" ")) {
    throw new Error(`Invalid Radancy identifier host: ${hostname}`);
  }
  return { hostname, companySiteId };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Probe an arbitrary URL to decide whether it's a Radancy careers site.
 * Returns identifier `{hostname}/{companySiteId}` or null. Used by the
 * target-companies POST route as a fallback after sync detectVendor().
 */
export async function detectRadancyAsync(
  url: string
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/html" },
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const hasTalentBrew = /tbcdn\.talentbrew\.com|radancy/i.test(html);
  if (!hasTalentBrew) return null;

  const idMatch = html.match(/data-company-site-id="(\d+)"/);
  if (!idMatch) return null;

  return `${parsed.hostname}/${idMatch[1]}`;
}

function extractTotalResults(resultsHtml: string): number {
  const m = resultsHtml.match(/data-total-results="(\d+)"/);
  if (!m) throw new Error("Radancy: missing data-total-results in results chunk");
  return Number(m[1]);
}

interface ParsedRadancyJob {
  externalId: string;
  title: string;
  path: string;
  location?: string;
}

/**
 * Extract job cards from the Radancy results HTML chunk.
 *
 * Shape:
 *   <li><a href="/job/{city}/{role}/{companySiteId}/{jobId}" data-job-id="{jobId}">
 *     <h2>{title}</h2>
 *     ...
 *     <span class="job-location">{location}</span>
 *   </a></li>
 */
function parseJobsFromResults(resultsHtml: string): ParsedRadancyJob[] {
  const out: ParsedRadancyJob[] = [];
  // Non-greedy, scoped to each <a> that carries data-job-id. Location is
  // optional because a few Radancy tenants omit it.
  const anchorRe =
    /<a\s+href="([^"]+)"[^>]*?data-job-id="(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(resultsHtml)) !== null) {
    const path = m[1];
    const externalId = m[2];
    const inner = m[3];

    const titleMatch = inner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";
    if (!title) continue;

    const locMatch = inner.match(
      /<span\s+class="job-location"[^>]*>([\s\S]*?)<\/span>/i
    );
    const location = locMatch
      ? locMatch[1].replace(/<[^>]+>/g, "").trim()
      : undefined;

    out.push({ externalId, title, path, location });
  }
  return out;
}

export async function scanRadancy(identifier: string): Promise<JobListing[]> {
  const { hostname, companySiteId } = parseIdentifier(identifier);

  const base = `https://${hostname}`;
  const allJobs: JobListing[] = [];
  const seenIds = new Set<string>();
  let retried429 = false;
  let totalResults = Infinity;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      ActiveFacetID: "0",
      CurrentPage: String(page),
      RecordsPerPage: String(RESULTS_PER_PAGE),
      Distance: "50",
      RadiusUnitType: "0",
      Keywords: "",
      Location: "",
      ShowRadius: "False",
      IsPagination: page > 1 ? "True" : "False",
      CustomFacetName: "",
      FacetTerm: "",
      FacetType: "0",
      SearchResultsModuleName: "Search Results",
      SearchFiltersModuleName: "Search Filters",
      SortCriteria: "0",
      SortDirection: "0",
      SearchType: "5",
      PostalCode: "",
      OrganizationIds: companySiteId,
    });

    const url = `${base}/search-jobs/results?${qs.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    let text: string;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          accept: "application/json",
          "user-agent":
            "Mozilla/5.0 (compatible; JobBoardBot/1.0; +career-scan)",
        },
      });

      if (res.status === 429) {
        if (retried429) throw new RadancyRateLimitError("Radancy rate limited");
        retried429 = true;
        await sleep(RETRY_BACKOFF_MS);
        page--;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new RadancyAuthError("Auth required -- remove this target");
      }
      if (!res.ok) {
        throw new Error(`Radancy returned ${res.status} for ${hostname}`);
      }

      text = await res.text();
    } finally {
      clearTimeout(timer);
    }

    let parsed: { results: string; hasJobs: boolean };
    try {
      parsed = RadancyResponseSchema.parse(JSON.parse(text));
    } catch {
      throw new Error("Radancy API shape changed: non-JSON or unexpected body");
    }

    if (!parsed.hasJobs || parsed.results.length === 0) break;

    if (page === 1) {
      try {
        totalResults = extractTotalResults(parsed.results);
      } catch {
        totalResults = Infinity;
      }
    }

    const pageJobs = parseJobsFromResults(parsed.results);
    if (pageJobs.length === 0) break;

    for (const j of pageJobs) {
      if (seenIds.has(j.externalId)) continue;
      seenIds.add(j.externalId);
      allJobs.push({
        externalId: j.externalId,
        title: j.title,
        url: j.path.startsWith("http") ? j.path : `${base}${j.path}`,
        location: j.location,
      });
    }

    retried429 = false;
    if (allJobs.length >= totalResults) break;
  }

  return allJobs;
}
