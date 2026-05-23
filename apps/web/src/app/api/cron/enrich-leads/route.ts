/**
 * Enrich Leads Cron — Stage 2 of the pipeline filter (safety net).
 *
 * The nightly-pipeline cron now calls `enrichLeadsForUser` inline before
 * building the morning digest, so most stubs are already enriched by the
 * time this runs. This cron remains as a periodic catch-up for any stubs
 * that nightly-pipeline didn't get to (e.g. leads added between runs).
 *
 * For each user, finds pending_review leads with a career_page_url and a
 * stub score, scrapes the real JD, re-scores, and either updates or
 * auto-skips based on the user's filter floor.
 */

import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { enrichLeadsForUser, type EnrichStats } from "@/lib/enrich-leads";

export const maxDuration = 300;

interface UserEnrichStats extends EnrichStats {
  userId: string;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleClient();

  const { data: connections } = await supabase
    .from("email_connections")
    .select("clerk_user_id")
    .eq("is_active", true);

  const results: UserEnrichStats[] = [];

  for (const conn of connections ?? []) {
    const userId = conn.clerk_user_id;
    try {
      const stats = await enrichLeadsForUser(supabase, userId);
      results.push({ userId, ...stats });
    } catch (err) {
      console.error(`[enrich-leads] user ${userId} failed:`, err);
      results.push({
        userId,
        candidates: 0,
        enriched: 0,
        filtered: 0,
        failed: 0,
        dead: 0,
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
