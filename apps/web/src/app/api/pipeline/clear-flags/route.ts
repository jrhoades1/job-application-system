import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * POST /api/pipeline/clear-flags
 *
 * Clears red_flags on all digest platform leads (LinkedIn, ZipRecruiter, etc.)
 * These flags are bogus — generated from scraping login pages, not real JDs.
 */
export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const DIGEST_PLATFORMS = [
      "LinkedIn", "Indeed", "Glassdoor", "ZipRecruiter",
      "Handshake", "Ladders", "Built In",
    ];

    const { data, error } = await supabase
      .from("pipeline_leads")
      .update({ red_flags: [] })
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("source_platform", DIGEST_PLATFORMS)
      .select("id");

    if (error) throw error;

    return NextResponse.json({
      cleared: data?.length ?? 0,
      message: `Cleared red flags on ${data?.length ?? 0} digest leads.`,
    });
  } catch (err) {
    console.error("Clear flags error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
