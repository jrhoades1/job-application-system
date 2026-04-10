import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * GET /api/insights/notifications
 *
 * Returns insight notifications for the current user.
 * Query params:
 *   - dismissed=true  : include dismissed insights (default: only active)
 *   - limit=20        : max results (default: 20)
 */
export async function GET(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const url = new URL(req.url);
    const showDismissed = url.searchParams.get("dismissed") === "true";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);

    let query = supabase
      .from("insight_notifications")
      .select("*")
      .eq("clerk_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!showDismissed) {
      query = query.eq("is_dismissed", false);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Also return count of dismissed for the "show dismissed" toggle
    const { count: dismissedCount } = await supabase
      .from("insight_notifications")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("is_dismissed", true);

    return NextResponse.json({
      insights: data ?? [],
      dismissed_count: dismissedCount ?? 0,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * PATCH /api/insights/notifications
 *
 * Bulk actions on insight notifications.
 * Body: { action: "dismiss_all" | "dismiss", ids?: string[] }
 */
export async function PATCH(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const { action, ids } = body as { action: string; ids?: string[] };

    if (action === "dismiss_all") {
      await supabase
        .from("insight_notifications")
        .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
        .eq("clerk_user_id", userId)
        .eq("is_dismissed", false);

      return NextResponse.json({ success: true });
    }

    if (action === "dismiss" && ids && ids.length > 0) {
      await supabase
        .from("insight_notifications")
        .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
        .eq("clerk_user_id", userId)
        .in("id", ids);

      return NextResponse.json({ success: true });
    }

    if (action === "restore" && ids && ids.length > 0) {
      await supabase
        .from("insight_notifications")
        .update({ is_dismissed: false, dismissed_at: null })
        .eq("clerk_user_id", userId)
        .in("id", ids);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
