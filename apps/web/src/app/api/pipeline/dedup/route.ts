import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

/**
 * POST /api/pipeline/dedup
 *
 * Removes duplicate pipeline leads (same company + role for same user).
 * Keeps the oldest lead (earliest created_at) and deletes the rest.
 */
export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const { data: leads, error } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, created_at")
      .eq("clerk_user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ removed: 0 });
    }

    // Group by normalized company+role, keep the first (oldest) of each group
    const seen = new Map<string, string>(); // key -> id to keep
    const toDelete: string[] = [];

    for (const lead of leads) {
      const key = `${(lead.company ?? "").toLowerCase().trim()}||${(lead.role ?? "").toLowerCase().trim()}`;
      if (seen.has(key)) {
        toDelete.push(lead.id);
      } else {
        seen.set(key, lead.id);
      }
    }

    if (toDelete.length === 0) {
      return NextResponse.json({ removed: 0 });
    }

    // Delete in batches of 50
    for (let i = 0; i < toDelete.length; i += 50) {
      const batch = toDelete.slice(i, i + 50);
      await supabase
        .from("pipeline_leads")
        .delete()
        .in("id", batch)
        .eq("clerk_user_id", userId);
    }

    return NextResponse.json({ removed: toDelete.length });
  } catch (err) {
    console.error("Dedup error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
