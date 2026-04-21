/**
 * POST /api/auto-pipeline
 *
 * One-command job-ingestion orchestrator. Given a URL, runs the standard
 * pipeline in sequence:
 *
 *   1. Scrape URL → company, role, JD
 *   2. Classify archetype
 *   3. Create application row
 *   4. Score against user achievements
 *
 * Optional (via body.withAi):
 *   5. Trigger tailored resume generation
 *   6. Trigger cover letter generation
 *
 * Rollback contract (per Jimmy's decision): any step failure deletes the
 * newly-created application + any match_scores row, and returns the error.
 * User sees no half-completed artifacts.
 *
 * Does NOT submit the application. Human review always precedes submit.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { z } from "zod";
import { classifyForWrite } from "@/lib/classify-on-write";

const inputSchema = z.object({
  url: z.string().url(),
  withAi: z.boolean().optional().default(false),
});

interface StageResult {
  stage: string;
  ok: boolean;
  duration_ms: number;
  error?: string;
  detail?: unknown;
}

async function callInternal<T>(
  req: Request,
  path: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  // Preserve cookies/auth for the internal call
  const url = new URL(path, req.url);
  const headers = new Headers();
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  headers.set("content-type", "application/json");

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      data = null;
    }
    return { ok: resp.ok, status: resp.status, data, error: resp.ok ? undefined : text };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const stages: StageResult[] = [];
  let applicationId: string | null = null;

  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { url, withAi } = parsed.data;

    // ───── Stage 1: scrape ──────────────────────────────────────────────
    const t1 = Date.now();
    const scrape = await callInternal<{
      company: string;
      role: string;
      description: string;
      source_url: string;
      source: string;
    }>(req, "/api/scrape-job", { url });
    stages.push({
      stage: "scrape",
      ok: scrape.ok,
      duration_ms: Date.now() - t1,
      error: scrape.ok ? undefined : scrape.error,
    });
    if (!scrape.ok || !scrape.data) {
      return NextResponse.json(
        { error: "scrape failed", stages, rolled_back: false },
        { status: 502 }
      );
    }
    const { company, role, description, source_url, source } = scrape.data;
    if (!company || !role || !description) {
      return NextResponse.json(
        { error: "scrape returned incomplete data", stages, rolled_back: false },
        { status: 502 }
      );
    }

    // ───── Stage 2: classify + create application ────────────────────────
    const t2 = Date.now();
    const archetypeFields = classifyForWrite({ role, jd: description });
    const { data: app, error: appError } = await supabase
      .from("applications")
      .insert({
        company,
        role,
        source,
        source_url,
        job_description: description,
        status: "evaluating",
        clerk_user_id: userId,
        ...archetypeFields,
      })
      .select("id")
      .single();
    stages.push({
      stage: "create",
      ok: !appError && !!app,
      duration_ms: Date.now() - t2,
      error: appError?.message,
      detail: { application_id: app?.id, archetype: archetypeFields.archetype },
    });
    if (appError || !app) {
      return NextResponse.json(
        { error: "create failed", stages, rolled_back: false },
        { status: 500 }
      );
    }
    applicationId = app.id;

    // ───── Stage 3: score ────────────────────────────────────────────────
    const t3 = Date.now();
    const score = await callInternal<{ overall: string; match_percentage: number }>(
      req,
      `/api/applications/${applicationId}/score`,
      {}
    );
    stages.push({
      stage: "score",
      ok: score.ok,
      duration_ms: Date.now() - t3,
      error: score.ok ? undefined : score.error,
      detail: score.data,
    });
    if (!score.ok) {
      // Roll back the app + any match_scores row
      await supabase.from("match_scores").delete().eq("application_id", applicationId);
      await supabase.from("applications").delete().eq("id", applicationId);
      return NextResponse.json(
        { error: "score failed — rolled back", stages, rolled_back: true },
        { status: 502 }
      );
    }

    // ───── Stage 4+5: (optional) AI tailoring ────────────────────────────
    if (withAi) {
      const t4 = Date.now();
      const resume = await callInternal(req, "/api/tailor-resume", {
        application_id: applicationId,
      });
      stages.push({
        stage: "tailor_resume",
        ok: resume.ok,
        duration_ms: Date.now() - t4,
        error: resume.ok ? undefined : resume.error,
      });

      const t5 = Date.now();
      const cover = await callInternal(req, "/api/generate-cover-letter", {
        application_id: applicationId,
      });
      stages.push({
        stage: "cover_letter",
        ok: cover.ok,
        duration_ms: Date.now() - t5,
        error: cover.ok ? undefined : cover.error,
      });

      // AI failures do NOT roll back — the app + score are already useful on
      // their own. Surface the failure so the user can retry individually.
    }

    return NextResponse.json({
      application_id: applicationId,
      company,
      role,
      archetype: archetypeFields.archetype,
      score_overall: score.data?.overall,
      score_match_percentage: score.data?.match_percentage,
      stages,
      total_duration_ms: Date.now() - t0,
      rolled_back: false,
    });
  } catch (err) {
    // Rollback if we created the app before hitting an unexpected error
    if (applicationId) {
      try {
        const { supabase } = await getAuthenticatedClient();
        await supabase.from("match_scores").delete().eq("application_id", applicationId);
        await supabase.from("applications").delete().eq("id", applicationId);
      } catch {
        // Best-effort rollback; error surfaced below anyway
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unauthorized") || msg.includes("Clerk")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "pipeline crashed", detail: msg, stages, rolled_back: !!applicationId },
      { status: 500 }
    );
  }
}
