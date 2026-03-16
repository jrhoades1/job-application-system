import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * POST /api/pipeline/clear-flags
 *
 * Clears red_flags on all digest platform leads (LinkedIn, ZipRecruiter, etc.)
 * Also soft-deletes junk leads created by failed extension captures.
 */
export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const DIGEST_PLATFORMS = [
      "LinkedIn", "Indeed", "Glassdoor", "ZipRecruiter",
      "Handshake", "Ladders", "Built In",
    ];

    // Clear red flags on digest leads
    const { data: flagsCleared, error } = await supabase
      .from("pipeline_leads")
      .update({ red_flags: [] })
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("source_platform", DIGEST_PLATFORMS)
      .select("id");

    if (error) throw error;

    // Soft-delete junk leads created by failed extension captures
    const now = new Date().toISOString();
    const { data: junkDeleted } = await supabase
      .from("pipeline_leads")
      .update({ deleted_at: now })
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .or("role.eq.Unknown Role,company.eq.Unknown")
      .select("id");

    return NextResponse.json({
      cleared: flagsCleared?.length ?? 0,
      junk_deleted: junkDeleted?.length ?? 0,
      message: `Cleared flags on ${flagsCleared?.length ?? 0} leads, deleted ${junkDeleted?.length ?? 0} junk leads.`,
    });
  } catch (err) {
    console.error("Clear flags error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
