import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * GET/POST /api/admin/fix-reverted-status
 *
 * One-time data fix for two bugs:
 * 1. Applications silently reverted to evaluation statuses by Zod v4 bug
 * 2. Applications/leads with platform names (e.g. "LinkedIn") as company
 */
export async function GET() {
  return run();
}

export async function POST() {
  return run();
}

const PLATFORM_NAMES = ["LinkedIn", "Indeed", "Glassdoor", "ZipRecruiter", "Dice", "Monster", "Hired", "Wellfound", "AngelList"];

/** Try to extract the real company name from a JD, URL, or role title */
function guessCompany(jd: string | null, url: string | null, role: string | null): string | null {
  // Try URL first — company career pages have the company in the hostname
  if (url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      // greenhouse.io/company, lever.co/company, etc.
      const atsMatch = url.match(/(?:boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com)\/([a-z0-9-]+)/i);
      if (atsMatch) return atsMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      // company.com career pages
      const parts = host.replace("www.", "").replace("jobs.", "").replace("careers.", "").split(".");
      const domain = parts[0];
      if (domain && domain.length > 2 && !/^(linkedin|indeed|glassdoor|ziprecruiter|dice|monster|workday|myworkdayjobs|smartrecruiters)$/.test(domain)) {
        return domain.charAt(0).toUpperCase() + domain.slice(1);
      }
    } catch { /* ignore bad URLs */ }
  }

  // Try JD text — look for "About [Company]", "at [Company]", "[Company] is" patterns
  if (jd) {
    const patterns = [
      /(?:about|join|at|welcome to)\s+([A-Z][A-Za-z0-9 &.,'-]{2,30})(?:\s*[,.]|\s+is\b|\s+we\b)/,
      /^([A-Z][A-Za-z0-9 &.,'-]{2,30})\s+is\s+(?:a|an|the|looking|seeking|hiring)/m,
      /(?:^|[.!]\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]*)*)\s+(?:delivers|provides|offers|builds|helps|enables|powers|creates|connects)\b/,
      /company:\s*([A-Z][A-Za-z0-9 &.,'-]{2,30})/i,
      /position\s+(?:at|with)\s+([A-Z][A-Za-z0-9 &.,'-]{2,30})/i,
    ];
    for (const pat of patterns) {
      const m = jd.match(pat);
      if (m) {
        const name = m[1].trim();
        const platformLower = PLATFORM_NAMES.map((p) => p.toLowerCase());
        if (!platformLower.includes(name.toLowerCase())) return name;
      }
    }
  }

  // Try role title — "Director at Company" or "Role | Company"
  if (role) {
    const atMatch = role.match(/\bat\s+([A-Z][A-Za-z0-9 &.,'-]+)$/);
    if (atMatch) return atMatch[1].trim();
    const pipeMatch = role.match(/\|\s*([A-Z][A-Za-z0-9 &.,'-]+)$/);
    if (pipeMatch) return pipeMatch[1].trim();
  }

  return null;
}

async function run() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const preApplyStatuses = ["evaluating", "pending_review", "ready_to_apply"];

    // --- Fix 1: Reverted statuses ---
    const { data: byReferral } = await supabase
      .from("applications")
      .select("id, company, role, status, applied_date")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("status", preApplyStatuses)
      .in("referral_status", ["pending", "contacted", "connected"]);

    const { data: byDate } = await supabase
      .from("applications")
      .select("id, company, role, status, applied_date")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("status", preApplyStatuses)
      .not("applied_date", "is", null);

    const { data: historyApplied } = await supabase
      .from("application_status_history")
      .select("application_id")
      .eq("clerk_user_id", userId)
      .eq("to_status", "applied");

    const historyAppIds = new Set((historyApplied ?? []).map((h) => h.application_id));
    let byHistory: typeof byReferral = [];
    if (historyAppIds.size > 0) {
      const { data } = await supabase
        .from("applications")
        .select("id, company, role, status, applied_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .in("status", preApplyStatuses)
        .in("id", Array.from(historyAppIds));
      byHistory = data ?? [];
    }

    const seen = new Set<string>();
    const statusFixed: { id: string; company: string; role: string; status: string; applied_date: string | null }[] = [];
    for (const app of [...(byReferral ?? []), ...(byDate ?? []), ...(byHistory ?? [])]) {
      if (!seen.has(app.id)) {
        seen.add(app.id);
        statusFixed.push(app);
      }
    }

    if (statusFixed.length > 0) {
      const ids = statusFixed.map((a) => a.id);
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("applications").update({ status: "applied" }).in("id", ids).eq("clerk_user_id", userId);
      const missingDate = statusFixed.filter((a) => !a.applied_date).map((a) => a.id);
      if (missingDate.length > 0) {
        await supabase.from("applications").update({ applied_date: today }).in("id", missingDate).eq("clerk_user_id", userId);
      }
      for (const app of statusFixed) {
        await supabase.from("application_status_history").insert({
          application_id: app.id, clerk_user_id: userId,
          from_status: app.status, to_status: "applied", source: "data_fix_zod_v4_bug",
        });
      }
    }

    // --- Quick fix: clean up "About the job Availity" from previous run ---
    await supabase
      .from("applications")
      .update({ company: "Availity" })
      .eq("clerk_user_id", userId)
      .eq("company", "About the job Availity");

    // --- Fix 1b: Clean up "Team | Company" pipe-formatted names ---
    const { data: pipeApps } = await supabase
      .from("applications")
      .select("id, company")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .like("company", "%|%");

    const pipeFixes: { id: string; was: string; now: string }[] = [];
    for (const app of pipeApps ?? []) {
      const parts = app.company.split("|").map((s: string) => s.trim());
      // Last segment after pipe is typically the company name
      const realCompany = parts[parts.length - 1];
      if (realCompany && realCompany !== app.company) {
        await supabase.from("applications").update({ company: realCompany }).eq("id", app.id).eq("clerk_user_id", userId);
        pipeFixes.push({ id: app.id, was: app.company, now: realCompany });
      }
    }

    // Same for pipeline leads
    const { data: pipeLeads } = await supabase
      .from("pipeline_leads")
      .select("id, company")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .like("company", "%|%");

    for (const lead of pipeLeads ?? []) {
      const parts = lead.company.split("|").map((s: string) => s.trim());
      const realCompany = parts[parts.length - 1];
      if (realCompany && realCompany !== lead.company) {
        await supabase.from("pipeline_leads").update({ company: realCompany }).eq("id", lead.id).eq("clerk_user_id", userId);
        pipeFixes.push({ id: lead.id, was: lead.company, now: realCompany });
      }
    }

    // --- Fix 2: Platform names as company — extract real names and fix ---
    const { data: platformApps } = await supabase
      .from("applications")
      .select("id, company, role, job_description, source_url")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("company", PLATFORM_NAMES);

    const { data: platformLeads } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text, career_page_url")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("company", PLATFORM_NAMES);

    // Try to extract real company names from JD/URL
    const appFixes: { id: string; role: string; was: string; now: string }[] = [];
    for (const app of platformApps ?? []) {
      const realCompany = guessCompany(app.job_description, app.source_url, app.role);
      if (realCompany) {
        await supabase.from("applications").update({ company: realCompany }).eq("id", app.id).eq("clerk_user_id", userId);
        appFixes.push({ id: app.id, role: app.role, was: app.company, now: realCompany });
      }
    }

    const leadFixes: { id: string; role: string; was: string; now: string }[] = [];
    for (const lead of platformLeads ?? []) {
      const realCompany = guessCompany(lead.description_text, lead.career_page_url, lead.role);
      if (realCompany) {
        await supabase.from("pipeline_leads").update({ company: realCompany }).eq("id", lead.id).eq("clerk_user_id", userId);
        leadFixes.push({ id: lead.id, role: lead.role, was: lead.company, now: realCompany });
      }
    }

    return NextResponse.json({
      status_fix: {
        fixed: statusFixed.length,
        applications: statusFixed.map((a) => ({ company: a.company, role: a.role, was: a.status, now: "applied" })),
      },
      pipe_name_fix: pipeFixes,
      platform_name_fix: {
        apps_fixed: appFixes,
        leads_fixed: leadFixes,
        apps_unfixed: (platformApps ?? []).filter((a) => !appFixes.some((f) => f.id === a.id)).map((a) => ({
          id: a.id, company: a.company, role: a.role,
          jd_preview: (a.job_description ?? "").slice(0, 300),
          source_url: a.source_url,
        })),
        leads_unfixed: (platformLeads ?? []).filter((l) => !leadFixes.some((f) => f.id === l.id)).map((l) => ({
          id: l.id, company: l.company, role: l.role,
          jd_preview: (l.description_text ?? "").slice(0, 300),
          url: l.career_page_url,
        })),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
