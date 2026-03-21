/**
 * Nightly Pipeline Cron — "Jobs Come to You"
 *
 * Runs at 2 AM UTC via Vercel Cron. For each user with an active Gmail
 * connection, triggers a full email sync, then identifies their top matches
 * above their configured threshold and records a digest summary.
 *
 * Auth: Vercel injects Authorization: Bearer <CRON_SECRET> automatically.
 * The endpoint also works with a manual Bearer token for local testing.
 */

import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { shouldSkipDigest, escapeHtml, type DigestSkipReason } from "./utils";

export const maxDuration = 300;

interface SyncResult {
  found: number;
  inserted: number;
  confirmed: number;
  skipped: number;
}

interface DigestLead {
  id: string;
  company: string;
  role: string;
  score_overall: string | null;
  score_match_percentage: number | null;
  career_page_url: string | null;
  location: string | null;
}

type DigestOutcome =
  | { skipped: DigestSkipReason }
  | { aboveThreshold: number; top3Count: number; emailSent: boolean };

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL}`;

  if (!appUrl) {
    return NextResponse.json(
      { error: "APP_URL not configured — set NEXT_PUBLIC_APP_URL or VERCEL_URL" },
      { status: 500 }
    );
  }

  // Get all users with active Gmail connections
  const { data: connections, error } = await supabase
    .from("email_connections")
    .select("clerk_user_id")
    .eq("is_active", true);

  if (error) {
    console.error("[nightly-pipeline] Failed to fetch connections:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const results: { userId: string; sync: SyncResult | null; digest: DigestOutcome }[] = [];

  for (const conn of connections ?? []) {
    const userId = conn.clerk_user_id;

    // 1. Trigger gmail sync for this user via internal HTTP call
    let syncResult: SyncResult | null = null;
    try {
      const syncRes = await fetch(`${appUrl}/api/gmail/sync`, {
        method: "POST",
        headers: {
          "x-cron-secret": cronSecret,
          "x-cron-user-id": userId,
        },
      });
      if (syncRes.ok) {
        syncResult = await syncRes.json();
      } else {
        console.error(`[nightly-pipeline] Sync failed for ${userId}:`, await syncRes.text());
      }
    } catch (err) {
      console.error(`[nightly-pipeline] Sync error for ${userId}:`, err);
    }

    // 2. Get this user's score threshold from profile preferences
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferences, email")
      .eq("clerk_user_id", userId)
      .single();

    const prefs = (profile?.preferences ?? {}) as {
      score_threshold?: number;
      digest_frequency?: string;
      digest_email?: string | null;
      auto_generate_materials?: boolean;
    };

    const threshold = prefs.score_threshold ?? 55;
    const digestFrequency = prefs.digest_frequency ?? "daily";

    // Skip digest based on frequency preference
    const skip = shouldSkipDigest(digestFrequency, new Date().getDay());
    if (skip.skip && skip.reason) {
      results.push({ userId, sync: syncResult, digest: { skipped: skip.reason } });
      continue;
    }

    // 3. Query new leads from today that score above threshold
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: topLeads } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, score_overall, score_match_percentage, career_page_url, location")
      .eq("clerk_user_id", userId)
      .in("status", ["pending_review", "promoted"])
      .gte("created_at", todayStart.toISOString())
      .gte("score_match_percentage", threshold)
      .is("deleted_at", null)
      .order("score_match_percentage", { ascending: false })
      .limit(10);

    const aboveThreshold = topLeads?.length ?? 0;
    const top3 = (topLeads ?? []).slice(0, 3) as DigestLead[];

    // 4. Record digest run summary
    const { error: insertError } = await supabase.from("digest_runs").insert({
      clerk_user_id: userId,
      run_date: new Date().toISOString().split("T")[0],
      emails_fetched: syncResult?.found ?? 0,
      leads_created: syncResult?.inserted ?? 0,
      above_threshold: aboveThreshold,
      top_leads: top3,
    });

    if (insertError) {
      console.error(`[nightly-pipeline] Failed to insert digest_run for ${userId}:`, insertError);
    }

    // 5. Optionally promote top 3 to applications (user triggers AI tailoring from UI)
    if (prefs.auto_generate_materials && top3.length > 0) {
      await queueMaterialGeneration(userId, top3, supabase);
    }

    // 6. Optionally send email digest via Resend
    const digestEmail = prefs.digest_email ?? profile?.email;
    if (digestEmail && process.env.RESEND_API_KEY && top3.length > 0) {
      await sendEmailDigest(userId, digestEmail, top3, aboveThreshold, appUrl);
    }

    results.push({
      userId,
      sync: syncResult,
      digest: { aboveThreshold, top3Count: top3.length, emailSent: !!(digestEmail && top3.length > 0) },
    });
  }

  console.log(`[nightly-pipeline] Processed ${results.length} users`);
  return NextResponse.json({ ok: true, processed: results.length, results });
}

/**
 * Promote top leads to applications so materials can be generated in-app.
 * Only promotes leads that aren't already applications.
 * AI tailoring (resume + cover letter) is left for the user to trigger
 * from the web UI — the leads show up in the "Leads" tab ready to go.
 */
async function queueMaterialGeneration(
  userId: string,
  leads: DigestLead[],
  supabase: ReturnType<typeof getServiceRoleClient>
) {
  for (const lead of leads) {
    // Check if already promoted to application
    const { data: existing } = await supabase
      .from("applications")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("company", lead.company)
      .eq("role", lead.role)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (existing) continue;

    // Promote the lead → create application in pending_review status
    const { data: app } = await supabase
      .from("applications")
      .insert({
        clerk_user_id: userId,
        company: lead.company,
        role: lead.role,
        status: "pending_review",
        source: "Nightly Pipeline",
        location: lead.location,
        source_url: lead.career_page_url,
      })
      .select("id")
      .single();

    if (!app) continue;

    // Mark lead as promoted
    await supabase
      .from("pipeline_leads")
      .update({ status: "promoted" })
      .eq("id", lead.id)
      .eq("clerk_user_id", userId);
  }
}

/**
 * Send morning digest email via Resend.
 * Only called when RESEND_API_KEY is configured.
 */
async function sendEmailDigest(
  userId: string,
  recipientEmail: string,
  leads: DigestLead[],
  totalAboveThreshold: number,
  appUrl: string
) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const leadRows = leads
    .map((l, i) => {
      const pct = l.score_match_percentage ? `${Math.round(l.score_match_percentage)}%` : "";
      const tier = l.score_overall ?? "";
      const company = escapeHtml(l.company);
      const role = escapeHtml(l.role);
      return `
        <tr>
          <td style="padding:8px 12px;font-weight:600;">${i + 1}. ${company}</td>
          <td style="padding:8px 12px;">${role}</td>
          <td style="padding:8px 12px;text-align:center;">${pct}</td>
          <td style="padding:8px 12px;text-align:center;">${tier}</td>
          <td style="padding:8px 12px;text-align:center;">
            <a href="${appUrl}/dashboard/jobs" style="color:#2563eb;">Review</a>
          </td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#111;">Your Morning Job Digest — ${today}</h2>
      <p style="color:#555;">
        ${totalAboveThreshold} new match${totalAboveThreshold !== 1 ? "es" : ""} above your threshold today.
        Here are your top ${leads.length}:
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:8px 12px;text-align:left;">Company</th>
            <th style="padding:8px 12px;text-align:left;">Role</th>
            <th style="padding:8px 12px;text-align:center;">Score</th>
            <th style="padding:8px 12px;text-align:center;">Tier</th>
            <th style="padding:8px 12px;text-align:center;">Action</th>
          </tr>
        </thead>
        <tbody>${leadRows}</tbody>
      </table>
      <p style="margin-top:20px;">
        <a href="${appUrl}/dashboard/jobs?tab=leads" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
          View All Leads →
        </a>
      </p>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
        You're receiving this because you enabled the morning digest in your
        <a href="${appUrl}/dashboard/settings?tab=bullseye">Bullseye settings</a>.
      </p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "digest@jobapp.co",
        to: recipientEmail,
        subject: `${leads.length} new job match${leads.length !== 1 ? "es" : ""} — ${today}`,
        html,
      }),
    });

    if (!res.ok) {
      console.error(`[nightly-pipeline] Resend failed for ${userId}:`, await res.text());
    }
  } catch (err) {
    console.error(`[nightly-pipeline] Email send error for ${userId}:`, err);
  }
}
