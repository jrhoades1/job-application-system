/**
 * Career Scan Cron — proactive job discovery.
 *
 * For each active target_company:
 *   1. Fetch the vendor's current listing set (e.g., Greenhouse JSON API)
 *   2. Diff against company_job_snapshots
 *   3. Insert new listings as pipeline_leads with stub scores
 *   4. Update / tombstone existing snapshots
 *   5. Record a career_scan_runs row for observability
 *
 * New leads seeded here carry career_page_url → the existing
 * enrich-leads cron will later fetch the real JD and replace the stub
 * score. No JD is ever reconstructed here — JDs come from the browser
 * extension or the enrich scraper.
 *
 * Runs hourly via vercel.json.
 */

import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { classifyForWrite } from "@/lib/classify-on-write";
import {
  scanCompany,
  diffSnapshots,
  WorkdayAuthError,
  WorkdayRateLimitError,
  RadancyAuthError,
  RadancyRateLimitError,
  IcimsAuthError,
  type JobListing,
  type AtsVendor,
  type ScanContext,
} from "@/career-scan";
import { evaluateStage1, type LeadFilterPrefs } from "@/lib/lead-filter";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WORKDAY_INTER_CALL_MS = 1500;
const RADANCY_INTER_CALL_MS = 1500;
const ICIMS_INTER_CALL_MS = 1000;

/**
 * Throttle key per vendor -- identifies the tenant we should skip for the
 * rest of a cron run after a 429. Null for vendors that don't need throttle
 * tracking (Greenhouse is unlimited; we could add if that changes).
 */
function throttleKeyFor(
  vendor: AtsVendor,
  identifier: string
): string | null {
  if (vendor === "workday") return `workday:${identifier.split("/")[0]}`;
  if (vendor === "radancy") return `radancy:${identifier.split("/")[0]}`;
  if (vendor === "icims") return `icims:${identifier}`;
  return null;
}

/**
 * Defensive read of the JSONB applied_facets column. We already enforce
 * `jsonb_typeof = 'object'` via CHECK constraint, but the DB client returns
 * `unknown`, and we filter to {string: string[]} before sending to Workday.
 */
function sanitizeFacets(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      Array.isArray(v) &&
      v.every((x) => typeof x === "string" && x.length > 0 && x.length < 200)
    ) {
      out[k] = v as string[];
    }
  }
  return out;
}

// Cache prefs per user per run — a single cron pass usually hits only one user
// but multi-tenant still benefits from a local memo.
async function loadUserPrefs(
  supabase: ReturnType<typeof getServiceRoleClient>,
  cache: Map<string, LeadFilterPrefs>,
  clerkUserId: string
): Promise<LeadFilterPrefs> {
  const cached = cache.get(clerkUserId);
  if (cached) return cached;

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("clerk_user_id", clerkUserId)
    .single();

  const prefs: LeadFilterPrefs = {
    lead_filter_enabled: profile?.preferences?.lead_filter_enabled ?? true,
    lead_filter_min_score: profile?.preferences?.lead_filter_min_score ?? 40,
    min_role_level: profile?.preferences?.min_role_level,
    salary_min: profile?.preferences?.salary_min ?? null,
    remote_preference: profile?.preferences?.remote_preference,
  };
  cache.set(clerkUserId, prefs);
  return prefs;
}

export const maxDuration = 300;

const MAX_COMPANIES_PER_RUN = 25;
const STALE_AFTER_MINUTES = 55;

interface CompanyResult {
  targetCompanyId: string;
  company: string;
  vendor: AtsVendor;
  status: "success" | "failed";
  jobsFound: number;
  jobsNew: number;
  leadsCreated: number;
  leadsFilteredOut: number;
  jobsRemoved: number;
  error?: string;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleClient();
  const staleCutoff = new Date(
    Date.now() - STALE_AFTER_MINUTES * 60 * 1000
  ).toISOString();

  const { data: targets, error: targetsErr } = await supabase
    .from("target_companies")
    .select("id, clerk_user_id, company_name, ats_vendor, ats_identifier, last_scanned_at, allow_llm_fallback, applied_facets")
    .eq("active", true)
    .or(`last_scanned_at.is.null,last_scanned_at.lt.${staleCutoff}`)
    .order("last_scanned_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMPANIES_PER_RUN);

  if (targetsErr) {
    return NextResponse.json(
      { error: "failed to load targets", detail: targetsErr.message },
      { status: 500 }
    );
  }

  const results: CompanyResult[] = [];
  const prefsCache = new Map<string, LeadFilterPrefs>();
  const throttledTenants = new Set<string>();

  for (const target of targets ?? []) {
    // Skip tenants that already 429'd this run (Workday & Radancy share a
    // namespace of identifier-prefixes; collisions between vendors are
    // impossible because the set is cleared each cron pass).
    const throttleKey = throttleKeyFor(
      target.ats_vendor as AtsVendor,
      target.ats_identifier
    );
    if (throttleKey && throttledTenants.has(throttleKey)) {
      results.push({
        targetCompanyId: target.id,
        company: target.company_name,
        vendor: target.ats_vendor as AtsVendor,
        status: "failed",
        jobsFound: 0,
        jobsNew: 0,
        leadsCreated: 0,
        leadsFilteredOut: 0,
        jobsRemoved: 0,
        error: "Skipped: tenant rate limited earlier in this run",
      });
      continue;
    }
    const { data: runInsert } = await supabase
      .from("career_scan_runs")
      .insert({ target_company_id: target.id, status: "running" })
      .select("id")
      .single();

    const runId = runInsert?.id as string | undefined;

    const result: CompanyResult = {
      targetCompanyId: target.id,
      company: target.company_name,
      vendor: target.ats_vendor as AtsVendor,
      status: "success",
      jobsFound: 0,
      jobsNew: 0,
      leadsCreated: 0,
      leadsFilteredOut: 0,
      jobsRemoved: 0,
    };

    try {
      // Build ScanContext for any vendor that may need DB access (LLM
      // fallback) or tenant-scoped config. Workday uses appliedFacets;
      // iCIMS uses allowLlmFallback. Other vendors ignore it.
      const scanContext: ScanContext | undefined =
        target.ats_vendor === "workday" || target.ats_vendor === "icims"
          ? {
              supabase,
              userId: target.clerk_user_id,
              allowLlmFallback: target.allow_llm_fallback ?? true,
              appliedFacets:
                target.ats_vendor === "workday"
                  ? sanitizeFacets(target.applied_facets)
                  : undefined,
            }
          : undefined;

      const fresh: JobListing[] = await scanCompany(
        target.ats_vendor as AtsVendor,
        target.ats_identifier,
        scanContext
      );
      result.jobsFound = fresh.length;

      const { data: prior } = await supabase
        .from("company_job_snapshots")
        .select("id, job_external_id")
        .eq("target_company_id", target.id)
        .is("removed_at", null);

      const diff = diffSnapshots(fresh, prior ?? []);
      result.jobsNew = diff.new.length;
      result.jobsRemoved = diff.removedIds.length;

      const nowIso = new Date().toISOString();

      if (diff.new.length > 0) {
        // Always record the snapshot — keeps diff accurate so filtered-out
        // roles aren't re-seen next run.
        //
        // Chunked: Radancy tenants like UHG can dump 5,000+ new rows on a
        // first scan, and a single INSERT of that size hits Supabase's
        // PostgREST payload ceiling and silently drops the whole batch.
        // 500 per batch keeps each request well under the 1MB edge.
        const snapshotRows = diff.new.map((j) => ({
          target_company_id: target.id,
          job_external_id: j.externalId,
          title: j.title,
          location: j.location ?? null,
          department: j.department ?? null,
          url: j.url,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        }));
        const SNAPSHOT_CHUNK = 500;
        for (let i = 0; i < snapshotRows.length; i += SNAPSHOT_CHUNK) {
          const chunk = snapshotRows.slice(i, i + SNAPSHOT_CHUNK);
          const { error: snapErr } = await supabase
            .from("company_job_snapshots")
            .insert(chunk);
          if (snapErr) {
            throw new Error(
              `snapshot insert failed at chunk ${i}: ${snapErr.message}`
            );
          }
        }

        // Stage 1 knockout filter — discipline/seniority/location/salary.
        // Only roles that pass become pipeline_leads. No JD needed — title
        // and location are enough for the knockout tier. Real-JD scoring
        // still happens later via enrich-leads cron.
        const prefs = await loadUserPrefs(
          supabase,
          prefsCache,
          target.clerk_user_id
        );

        const passing: JobListing[] = [];
        for (const j of diff.new) {
          const verdict = evaluateStage1(
            {
              role: j.title,
              company: target.company_name,
              location: j.location ?? null,
            },
            prefs,
            { strict: true }
          );
          if (verdict.pass) passing.push(j);
        }

        result.leadsCreated = passing.length;
        result.leadsFilteredOut = diff.new.length - passing.length;

        if (passing.length > 0) {
          const leadRows = passing.map((j) => {
            const archetypeFields = classifyForWrite({ role: j.title, jd: "" });
            return {
              clerk_user_id: target.clerk_user_id,
              company: target.company_name,
              role: j.title,
              source_platform: "career_scan",
              career_page_url: j.url,
              ats_type: target.ats_vendor,
              location: j.location ?? null,
              status: "pending_review" as const,
              score_details: { score_source: "estimated" },
              confidence: 1.0,
              pipeline_batch: `career_scan_${nowIso.slice(0, 10)}`,
              ...archetypeFields,
            };
          });
          await supabase.from("pipeline_leads").insert(leadRows);
        }
      }

      if (diff.stillPresent.length > 0) {
        const stillIds = diff.stillPresent.map((s) => s.snapshotId);
        await supabase
          .from("company_job_snapshots")
          .update({ last_seen_at: nowIso })
          .in("id", stillIds);
      }

      if (diff.removedIds.length > 0) {
        await supabase
          .from("company_job_snapshots")
          .update({ removed_at: nowIso })
          .in("id", diff.removedIds);
      }

      await supabase
        .from("target_companies")
        .update({ last_scanned_at: nowIso, last_error: null })
        .eq("id", target.id);

      if (runId) {
        await supabase
          .from("career_scan_runs")
          .update({
            finished_at: nowIso,
            jobs_found: result.jobsFound,
            jobs_new: result.leadsCreated,
            jobs_removed: result.jobsRemoved,
            status: "success",
          })
          .eq("id", runId);
      }
    } catch (err) {
      // Skip this tenant for the rest of the run on rate-limit errors.
      if (
        err instanceof WorkdayRateLimitError ||
        err instanceof RadancyRateLimitError
      ) {
        const key = throttleKeyFor(
          target.ats_vendor as AtsVendor,
          target.ats_identifier
        );
        if (key) throttledTenants.add(key);
      }
      const message =
        err instanceof WorkdayAuthError ||
        err instanceof RadancyAuthError ||
        err instanceof IcimsAuthError
          ? "Auth required -- remove this target"
          : err instanceof Error
            ? err.message
            : String(err);
      result.status = "failed";
      result.error = message;

      await supabase
        .from("target_companies")
        .update({
          last_scanned_at: new Date().toISOString(),
          last_error: message.slice(0, 500),
        })
        .eq("id", target.id);

      if (runId) {
        await supabase
          .from("career_scan_runs")
          .update({
            finished_at: new Date().toISOString(),
            status: "failed",
            error_message: message.slice(0, 1000),
          })
          .eq("id", runId);
      }

      console.error(
        `[career-scan] ${target.company_name} (${target.ats_vendor}/${target.ats_identifier}) failed:`,
        err
      );
    }

    results.push(result);

    // Rate-limit courtesy delay between calls to non-unlimited vendors.
    if (target.ats_vendor === "workday") {
      await sleep(WORKDAY_INTER_CALL_MS);
    } else if (target.ats_vendor === "radancy") {
      await sleep(RADANCY_INTER_CALL_MS);
    } else if (target.ats_vendor === "icims") {
      await sleep(ICIMS_INTER_CALL_MS);
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
