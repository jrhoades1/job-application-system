import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * GET/POST /api/admin/fix-reverted-status
 *
 * One-time data fix: finds applications silently reverted to evaluation
 * statuses by the Zod v4 .default("evaluating") bug, and restores them
 * to "applied".
 *
 * Detection strategy (broadened):
 * 1. Apps with referral_status set + currently in pre-apply status
 * 2. Apps with applied_date set + currently in pre-apply status
 * 3. Apps whose status_history shows they were previously "applied"
 *    but are now in a pre-apply status
 */
export async function GET() {
  return run();
}

export async function POST() {
  return run();
}

async function run() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const preApplyStatuses = ["evaluating", "pending_review", "ready_to_apply"];

    // Strategy 1: referral_status set (only happens via apply flow)
    const { data: byReferral } = await supabase
      .from("applications")
      .select("id, company, role, status, applied_date")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("status", preApplyStatuses)
      .in("referral_status", ["pending", "contacted", "connected"]);

    // Strategy 2: applied_date set but status reverted
    const { data: byDate } = await supabase
      .from("applications")
      .select("id, company, role, status, applied_date")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("status", preApplyStatuses)
      .not("applied_date", "is", null);

    // Strategy 3: status_history shows a previous transition TO "applied"
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

    // Merge and deduplicate
    const seen = new Set<string>();
    const affected: { id: string; company: string; role: string; status: string; applied_date: string | null }[] = [];
    for (const app of [...(byReferral ?? []), ...(byDate ?? []), ...(byHistory ?? [])]) {
      if (!seen.has(app.id)) {
        seen.add(app.id);
        affected.push(app);
      }
    }

    if (affected.length === 0) {
      return NextResponse.json({ fixed: 0, applications: [] });
    }

    const ids = affected.map((a) => a.id);
    const today = new Date().toISOString().split("T")[0];

    // Restore to "applied"
    const { error: updateError } = await supabase
      .from("applications")
      .update({ status: "applied" })
      .in("id", ids)
      .eq("clerk_user_id", userId);

    if (updateError) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    // Backfill applied_date for any that lost it
    const missingDate = affected.filter((a) => !a.applied_date).map((a) => a.id);
    if (missingDate.length > 0) {
      await supabase
        .from("applications")
        .update({ applied_date: today })
        .in("id", missingDate)
        .eq("clerk_user_id", userId);
    }

    // Record in status history
    for (const app of affected) {
      await supabase.from("application_status_history").insert({
        application_id: app.id,
        clerk_user_id: userId,
        from_status: app.status,
        to_status: "applied",
        source: "data_fix_zod_v4_bug",
      });
    }

    return NextResponse.json({
      fixed: affected.length,
      applications: affected.map((a) => ({
        company: a.company,
        role: a.role,
        was: a.status,
        now: "applied",
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
