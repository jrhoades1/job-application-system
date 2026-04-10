import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * POST /api/applications/[id]/snooze
 *
 * Resets the decay clock for an application without changing its status.
 * Inserts a new application_status_history row with source: 'snooze',
 * which the decay engine uses as the new "entered_at" timestamp.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { id } = await params;

    // Verify the application exists and belongs to this user
    const { data: app, error: fetchError } = await supabase
      .from("applications")
      .select("id, status")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !app) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Insert a status history row that resets the decay clock
    const { error: historyError } = await supabase
      .from("application_status_history")
      .insert({
        application_id: id,
        clerk_user_id: userId,
        from_status: app.status,
        to_status: app.status,
        source: "snooze",
      });

    if (historyError) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: app.status,
      snoozed_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
