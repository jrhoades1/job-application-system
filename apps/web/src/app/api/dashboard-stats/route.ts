import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const [totalRes, activeRes, interviewingRes, offeredRes, stalledRes, followupsRes, recentRes] =
      await Promise.all([
        // Total count
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId),

        // Active: applied, interviewing
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .in("status", ["applied", "interviewing"]),

        // Interviewing
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .eq("status", "interviewing"),

        // Offered + accepted
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .in("status", ["offered", "accepted"]),

        // Stalled: applied > 21 days ago
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .eq("status", "applied")
          .lt("applied_date", new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()),

        // Follow-ups due (follow_up_date <= now)
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .not("follow_up_date", "is", null)
          .lte("follow_up_date", new Date().toISOString()),

        // Recent 5 — only the fields we need
        supabase
          .from("applications")
          .select("id, company, role, status, updated_at")
          .eq("clerk_user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(5),
      ]);

    return NextResponse.json({
      total: totalRes.count ?? 0,
      active: activeRes.count ?? 0,
      interviewing: interviewingRes.count ?? 0,
      offered: offeredRes.count ?? 0,
      stalled: stalledRes.count ?? 0,
      followups_due: followupsRes.count ?? 0,
      recent: recentRes.data ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
