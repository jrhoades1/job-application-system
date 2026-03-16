import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * POST /api/pipeline/reset-digest-leads
 *
 * Soft-deletes digest leads that have stub or raw-email descriptions
 * so they can be re-synced with the improved extraction pipeline.
 * Also soft-deletes any auto-promoted applications tied to those leads.
 */
export const maxDuration = 30;

export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Find digest leads with bad descriptions
    const { data: leads, error } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, email_uid, description_text, source_platform")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .not("description_text", "is", null);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return NextResponse.json({ deleted: 0, message: "No leads found." });
    }

    const DIGEST_PLATFORMS = new Set([
      "linkedin", "indeed", "glassdoor", "ziprecruiter", "handshake",
      "ladders", "built in",
    ]);

    // Find leads that need resetting
    const toReset = leads.filter((l) => {
      // Only reset digest platform leads
      if (!l.source_platform || !DIGEST_PLATFORMS.has(l.source_platform.toLowerCase())) {
        return false;
      }

      const text = (l.description_text ?? "").trim();

      // Stub descriptions (< 200 chars, no real JD content)
      if (text.length < 200) return true;

      // Still has full email body
      const lower = text.toLowerCase();
      return (
        lower.includes("here are today") ||
        lower.includes("jobs for you") ||
        lower.includes("job alert") ||
        lower.includes("recommended for you") ||
        lower.includes("view details")
      );
    });

    if (toReset.length === 0) {
      return NextResponse.json({
        deleted: 0,
        message: "No digest leads need resetting.",
      });
    }

    const now = new Date().toISOString();
    const resetIds = toReset.map((l) => l.id);
    const resetUids = toReset.map((l) => l.email_uid).filter(Boolean);

    // Soft-delete the bad leads
    const { error: deleteError } = await supabase
      .from("pipeline_leads")
      .update({ deleted_at: now })
      .eq("clerk_user_id", userId)
      .in("id", resetIds);

    if (deleteError) throw deleteError;

    // Also soft-delete any auto-promoted applications tied to these leads
    let appsDeleted = 0;
    if (resetUids.length > 0) {
      const { data: apps } = await supabase
        .from("applications")
        .select("id")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .in("email_uid", resetUids);

      if (apps && apps.length > 0) {
        await supabase
          .from("applications")
          .update({ deleted_at: now })
          .eq("clerk_user_id", userId)
          .in("id", apps.map((a) => a.id));
        appsDeleted = apps.length;
      }
    }

    return NextResponse.json({
      deleted: toReset.length,
      apps_deleted: appsDeleted,
      message: `Soft-deleted ${toReset.length} digest leads and ${appsDeleted} linked applications. Re-sync Gmail to re-process them.`,
    });
  } catch (err) {
    console.error("Reset digest leads error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
