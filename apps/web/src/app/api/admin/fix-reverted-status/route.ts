import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * POST /api/admin/fix-reverted-status
 *
 * One-time data fix: finds applications that were silently reverted to
 * evaluation statuses by the Zod v4 .default("evaluating") bug, and
 * restores them to "applied".
 *
 * Detection: referral_status is only set when status transitions to "applied",
 * so any app with referral_status IN (pending, contacted, connected) that is
 * currently in a pre-apply status was affected by the bug.
 */
export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Find affected applications
    const { data: affected, error: findError } = await supabase
      .from("applications")
      .select("id, company, role, status, referral_status, applied_date")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("status", ["evaluating", "pending_review", "ready_to_apply"])
      .in("referral_status", ["pending", "contacted", "connected"]);

    if (findError) {
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    if (!affected || affected.length === 0) {
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
