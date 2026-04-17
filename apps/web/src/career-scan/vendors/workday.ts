/**
 * Workday vendor scanner.
 *
 * Primary path: POST to the CxS (Candidate Experience Services) JSON API.
 * Requires a CSRF token established via an initial GET on the careers page.
 *
 * Fallback: when CxS returns non-JSON (HTML, auth redirect), delegates to
 * LLM extraction via llm-extract.ts if context.allowLlmFallback is true.
 *
 * identifier format: "{tenant}/{wdN}/{site}"
 *   e.g. "humana/wd5/Humana_External_Career_Site"
 */

import { z } from "zod";
import type { JobListing, ScanContext } from "../types";
import { extractJobsFromHtml } from "../llm-extract";

// --- Zod schemas for CxS response ---

const WorkdayJobSchema = z.object({
  title: z.string(),
  externalPath: z.string(),
  locationsText: z.string().optional().default(""),
  subtitleText: z.string().optional().default(""),
});

const WorkdayCxsResponseSchema = z.object({
  jobPostings: z.array(WorkdayJobSchema),
  total: z.number(),
});

// --- Constants ---

const MAX_LISTINGS = 500;
const PAGE_SIZE = 20;
const FETCH_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS = 5_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;

// --- Error classes ---

export class WorkdayAuthError extends Error {
  name = "WorkdayAuthError" as const;
}

export class WorkdayRateLimitError extends Error {
  name = "WorkdayRateLimitError" as const;
}

// --- Helpers ---

function parseIdentifier(identifier: string): {
  tenant: string;
  wdNum: string;
  site: string;
} {
  const parts = identifier.split("/");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error(`Invalid Workday identifier: ${identifier}`);
  }
  return { tenant: parts[0], wdNum: parts[1], site: parts[2] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractCsrfToken(html: string, headers: Headers): string | null {
  for (const [key, value] of headers) {
    if (key.toLowerCase().startsWith("x-calypso-csrf-token")) return value;
  }
  // JSON property: "csrfToken": "abc123"
  const jsonMatch = html.match(/"csrfToken"\s*:\s*"([^"]+)"/);
  if (jsonMatch) return jsonMatch[1];
  // JS assignment: window.csrfToken = "abc123" or csrfToken = "abc123"
  const assignMatch = html.match(/csrfToken\s*=\s*"([^"]+)"/);
  if (assignMatch) return assignMatch[1];
  // Meta tag
  const metaMatch = html.match(
    /name=["']csrf-token["']\s+content=["']([^"']+)["']/i
  );
  return metaMatch?.[1] ?? null;
}

function isAuthGated(status: number, html: string): boolean {
  if (status === 401 || status === 403) return true;
  if (/<form[^>]*(?:login|sign.?in)/i.test(html)) return true;
  return false;
}

// --- Main scanner ---

export async function scanWorkday(
  identifier: string,
  context?: ScanContext
): Promise<JobListing[]> {
  const { tenant, wdNum, site } = parseIdentifier(identifier);

  const baseUrl = `https://${tenant}.${wdNum}.myworkdayjobs.com`;
  const landingUrl = `${baseUrl}/${site}`;
  const cxsUrl = `${baseUrl}/wday/cxs/${tenant}/${site}/jobs`;

  // Step 1: GET landing page for CSRF token + cookies
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let landingRes: Response;
  let landingHtml: string;
  let cookies: string;
  try {
    landingRes = await fetch(landingUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/html" },
    });
    landingHtml = await landingRes.text();
    cookies =
      landingRes.headers
        .getSetCookie?.()
        ?.map((c: string) => c.split(";")[0])
        .join("; ") ?? "";
  } finally {
    clearTimeout(timer);
  }

  if (isAuthGated(landingRes.status, landingHtml)) {
    throw new WorkdayAuthError("Auth required -- remove this target");
  }

  const csrfToken = extractCsrfToken(landingHtml, landingRes.headers);
  if (!csrfToken) {
    // No CSRF = likely HTML-only tenant. Try LLM fallback.
    if (context?.allowLlmFallback && context.supabase && context.userId) {
      return extractJobsFromHtml(
        landingHtml,
        tenant,
        baseUrl,
        context.supabase,
        context.userId
      );
    }
    return [];
  }

  // Step 2: Paginate CxS API
  const allJobs: JobListing[] = [];
  let offset = 0;
  let retried429 = false;

  const appliedFacets = context?.appliedFacets ?? {};

  while (offset < MAX_LISTINGS) {
    const body = JSON.stringify({
      appliedFacets,
      limit: PAGE_SIZE,
      offset,
      searchText: "",
    });

    const postController = new AbortController();
    const postTimer = setTimeout(
      () => postController.abort(),
      FETCH_TIMEOUT_MS
    );

    let res: Response;
    let resText: string;
    try {
      res = await fetch(cxsUrl, {
        method: "POST",
        signal: postController.signal,
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies,
          "X-Calypso-CSRF-Token": csrfToken,
          Origin: baseUrl,
          Referer: landingUrl,
        },
        body,
      });

      if (res.status === 429) {
        if (retried429) throw new WorkdayRateLimitError("Workday rate limited");
        retried429 = true;
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }

      if (isAuthGated(res.status, "")) {
        throw new WorkdayAuthError("Auth required -- remove this target");
      }

      if (!res.ok) {
        throw new Error(`Workday CxS returned ${res.status} for ${tenant}`);
      }

      const contentLength = Number(res.headers.get("content-length") ?? 0);
      if (contentLength > MAX_BODY_BYTES) {
        throw new Error(`Workday response too large: ${contentLength} bytes`);
      }
      resText = await res.text();
    } finally {
      clearTimeout(postTimer);
    }

    let parsed: z.infer<typeof WorkdayCxsResponseSchema>;
    try {
      parsed = WorkdayCxsResponseSchema.parse(JSON.parse(resText));
    } catch {
      // Non-JSON response — try LLM fallback on the original landing HTML
      if (context?.allowLlmFallback && context.supabase && context.userId) {
        return extractJobsFromHtml(
          landingHtml,
          tenant,
          baseUrl,
          context.supabase,
          context.userId
        );
      }
      return [];
    }

    for (const job of parsed.jobPostings) {
      allJobs.push({
        externalId: job.externalPath,
        title: job.title,
        url: `${baseUrl}${job.externalPath}`,
        location: job.locationsText || undefined,
        department: job.subtitleText || undefined,
      });
    }

    offset += PAGE_SIZE;
    if (offset >= parsed.total || parsed.jobPostings.length === 0) break;
    retried429 = false;
  }

  return allJobs;
}
