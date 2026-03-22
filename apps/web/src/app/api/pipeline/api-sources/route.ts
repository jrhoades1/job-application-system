/**
 * API Sources Pipeline — "Jobs Come to You" supplement
 *
 * Fetches fresh job listings from Jobicy (free, no auth) and Adzuna (requires
 * ADZUNA_APP_ID + ADZUNA_APP_KEY env vars), scores them against the user's
 * profile, and inserts new leads into pipeline_leads.
 *
 * Auth: x-cron-secret + x-cron-user-id headers (same as /api/gmail/sync).
 * Called by /api/cron/nightly-pipeline after the Gmail sync step.
 *
 * Dedup key format: "jobicy:{id}" or "adzuna:{id}" stored in email_uid.
 */

import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import {
  extractRequirements,
  scoreRequirement,
  scoreRequirementsWithAI,
  calculateOverallScore,
} from "@/scoring";
import {
  extractRequirementsWithAI,
  requirementsFromRoleTitle,
} from "@/lib/extract-requirements-ai";

export const maxDuration = 120;

// ── Jobicy types ──────────────────────────────────────────────────────────────

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobGeo: string;
  jobType: string;
  pubDate: string;
  annualSalaryMin?: number;
  annualSalaryMax?: number;
  jobExcerpt: string;
  jobDescription?: string;
}

interface JobicyResponse {
  jobs?: JobicyJob[];
}

// ── Adzuna types ──────────────────────────────────────────────────────────────

interface AdzunaJob {
  id: string;
  title: string;
  company: { display_name: string };
  description: string;
  redirect_url: string;
  location: { display_name: string };
  salary_min?: number;
  salary_max?: number;
  created: string;
}

interface AdzunaResponse {
  results?: AdzunaJob[];
}

// ── Normalised internal type ──────────────────────────────────────────────────

interface ApiJob {
  uid: string;
  company: string;
  role: string;
  location: string | null;
  description: string | null;
  url: string | null;
  compensation: string | null;
  platform: string;
  publishedAt: string;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchJobicy(keyword: string): Promise<ApiJob[]> {
  const params = new URLSearchParams({
    count: "50",
    tag: keyword,
    geo: "usa",
  });

  const res = await fetch(
    `https://jobicy.com/api/v2/remote-jobs?${params.toString()}`,
    { signal: AbortSignal.timeout(15_000) }
  );

  if (!res.ok) {
    console.warn(`[api-sources] Jobicy returned ${res.status}`);
    return [];
  }

  const data = (await res.json()) as JobicyResponse;
  return (data.jobs ?? []).map((j) => ({
    uid: `jobicy:${j.id}`,
    company: j.companyName,
    role: j.jobTitle,
    location: j.jobGeo || null,
    description: j.jobDescription || j.jobExcerpt || null,
    url: j.url,
    compensation:
      j.annualSalaryMin && j.annualSalaryMax
        ? `$${j.annualSalaryMin.toLocaleString()}–$${j.annualSalaryMax.toLocaleString()}`
        : null,
    platform: "Jobicy",
    publishedAt: j.pubDate,
  }));
}

async function fetchAdzuna(
  keyword: string,
  appId: string,
  appKey: string
): Promise<ApiJob[]> {
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what: keyword,
    results_per_page: "20",
    max_days_old: "1",
    content_type: "application/json",
  });

  const res = await fetch(
    `https://api.adzuna.com/v1/api/jobs/us/search/1?${params.toString()}`,
    { signal: AbortSignal.timeout(15_000) }
  );

  if (!res.ok) {
    console.warn(`[api-sources] Adzuna returned ${res.status}`);
    return [];
  }

  const data = (await res.json()) as AdzunaResponse;
  return (data.results ?? []).map((j) => ({
    uid: `adzuna:${j.id}`,
    company: j.company.display_name,
    role: j.title,
    location: j.location.display_name || null,
    description: j.description || null,
    url: j.redirect_url,
    compensation:
      j.salary_min && j.salary_max
        ? `$${Math.round(j.salary_min).toLocaleString()}–$${Math.round(j.salary_max).toLocaleString()}`
        : null,
    platform: "Adzuna",
    publishedAt: j.created,
  }));
}

// ── Scoring helper (mirrors gmail/sync scoreLead) ─────────────────────────────

async function scoreJob(
  description: string | null,
  role: string,
  company: string,
  achievementsMap: Record<string, string[]>
) {
  let descText = description ?? "";
  let allReqs = [] as string[];
  let redFlags = [] as string[];
  let scoreSource: "scored" | "estimated" = "scored";

  if (descText.length > 50) {
    const reqs = extractRequirements(descText);
    allReqs = [...reqs.hard_requirements, ...reqs.preferred];
    redFlags = reqs.red_flags;

    if (allReqs.length === 0) {
      try {
        const aiReqs = await extractRequirementsWithAI(descText, role, company);
        allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
        redFlags = [...redFlags, ...aiReqs.red_flags];
      } catch {
        // AI unavailable — fall through to role-title inference
      }
    }
  }

  if (allReqs.length === 0) {
    allReqs = requirementsFromRoleTitle(role);
    scoreSource = "estimated";
  }

  let matches = await scoreRequirementsWithAI(allReqs, achievementsMap, {
    role,
    company,
  }).catch(() => []);

  if (matches.length === 0) {
    matches = allReqs.map((r) => scoreRequirement(r, achievementsMap));
  }

  return { score: calculateOverallScore(matches, scoreSource), redFlags };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const reqSecret = req.headers.get("x-cron-secret");
  const userId = req.headers.get("x-cron-user-id");

  if (!cronSecret || reqSecret !== cronSecret || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleClient();

  // Load user profile for target roles + achievements
  const { data: profile } = await supabase
    .from("profiles")
    .select("achievements, preferences")
    .eq("clerk_user_id", userId)
    .single();

  const prefs = (profile?.preferences ?? {}) as {
    target_roles?: string[];
    remote_preference?: string;
  };

  const targetRoles: string[] = (prefs.target_roles ?? []).filter(Boolean);
  if (targetRoles.length === 0) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      skipped: 0,
      message: "No target roles configured — set them in Bullseye settings",
    });
  }

  // Build achievements map for scoring
  const achievementsMap: Record<string, string[]> = {};
  for (const cat of (profile?.achievements ?? []) as {
    category: string;
    items: { text: string }[];
  }[]) {
    if (cat.category && Array.isArray(cat.items)) {
      achievementsMap[cat.category] = cat.items.map((i) => i.text);
    }
  }

  // Load existing API-source lead UIDs for dedup
  const { data: existingLeads } = await supabase
    .from("pipeline_leads")
    .select("email_uid")
    .eq("clerk_user_id", userId)
    .is("deleted_at", null)
    .or("email_uid.like.jobicy:%,email_uid.like.adzuna:%");

  const existingUids = new Set(
    (existingLeads ?? []).map((l) => l.email_uid).filter(Boolean)
  );

  // Fetch from both sources for each target role (deduplicated across roles)
  const adzunaAppId = process.env.ADZUNA_APP_ID;
  const adzunaAppKey = process.env.ADZUNA_APP_KEY;

  const allJobs = new Map<string, ApiJob>();

  for (const keyword of targetRoles) {
    // Jobicy — always available
    try {
      const jobs = await fetchJobicy(keyword);
      for (const j of jobs) {
        if (!allJobs.has(j.uid)) allJobs.set(j.uid, j);
      }
    } catch (err) {
      console.error(`[api-sources] Jobicy fetch failed for "${keyword}":`, err);
    }

    // Adzuna — only if credentials are configured
    if (adzunaAppId && adzunaAppKey) {
      try {
        const jobs = await fetchAdzuna(keyword, adzunaAppId, adzunaAppKey);
        for (const j of jobs) {
          if (!allJobs.has(j.uid)) allJobs.set(j.uid, j);
        }
      } catch (err) {
        console.error(
          `[api-sources] Adzuna fetch failed for "${keyword}":`,
          err
        );
      }
    }
  }

  let inserted = 0;
  let skipped = 0;

  for (const job of allJobs.values()) {
    if (existingUids.has(job.uid)) {
      skipped++;
      continue;
    }

    try {
      const { score, redFlags } = await scoreJob(
        job.description,
        job.role,
        job.company,
        achievementsMap
      );

      await supabase.from("pipeline_leads").insert({
        clerk_user_id: userId,
        company: job.company,
        role: job.role,
        location: job.location,
        source_platform: job.platform,
        email_uid: job.uid,
        email_date: job.publishedAt,
        description_text: job.description,
        career_page_url: job.url,
        compensation: job.compensation,
        status: "pending_review",
        score_overall: score.overall,
        score_match_percentage: score.match_percentage,
        score_details: {
          strong_count: score.strong_count,
          partial_count: score.partial_count,
          gap_count: score.gap_count,
          score_source: score.score_source,
        },
        red_flags: redFlags,
        created_at: new Date().toISOString(),
      });

      existingUids.add(job.uid);
      inserted++;
    } catch (err) {
      console.error(`[api-sources] Failed to insert lead ${job.uid}:`, err);
    }
  }

  console.log(
    `[api-sources] user=${userId} fetched=${allJobs.size} inserted=${inserted} skipped=${skipped}`
  );

  return NextResponse.json({ ok: true, inserted, skipped });
}
