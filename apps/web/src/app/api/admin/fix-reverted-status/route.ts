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

    // --- Fix 2: Platform names as company ---
    const { data: platformApps } = await supabase
      .from("applications")
      .select("id, company, role")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("company", PLATFORM_NAMES);

    const { data: platformLeads } = await supabase
      .from("pipeline_leads")
      .select("id, company, role")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("company", PLATFORM_NAMES);

    return NextResponse.json({
      status_fix: {
        fixed: statusFixed.length,
        applications: statusFixed.map((a) => ({ company: a.company, role: a.role, was: a.status, now: "applied" })),
      },
      platform_name_fix: {
        applications: (platformApps ?? []).map((a) => ({ id: a.id, company: a.company, role: a.role })),
        leads: (platformLeads ?? []).map((l) => ({ id: l.id, company: l.company, role: l.role })),
        note: "These have platform names as company. Review and update manually, or re-parse the leads.",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
