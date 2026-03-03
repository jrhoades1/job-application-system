import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const { userId } = await getAuthenticatedClient();

    // Only the admin can see all-user data
    const adminUserId = process.env.ADMIN_USER_ID;
    if (!adminUserId || userId !== adminUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Use service role to read across all users
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString();

    const { data: usage } = await supabaseAdmin
      .from("ai_generations")
      .select("clerk_user_id, generation_type, cost_usd, created_at")
      .gte("created_at", monthStart);

    const records = usage ?? [];

    // Group by user
    const byUser: Record<string, { calls: number; cost: number; types: Record<string, number> }> = {};
    for (const r of records) {
      const uid = r.clerk_user_id;
      if (!byUser[uid]) byUser[uid] = { calls: 0, cost: 0, types: {} };
      byUser[uid].calls++;
      byUser[uid].cost += r.cost_usd ?? 0;
      const t = r.generation_type ?? "unknown";
      byUser[uid].types[t] = (byUser[uid].types[t] ?? 0) + 1;
    }

    // Sort by cost desc
    const sorted = Object.entries(byUser)
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort((a, b) => b.cost - a.cost);

    return NextResponse.json({
      total_users: sorted.length,
      total_cost: records.reduce((s, r) => s + (r.cost_usd ?? 0), 0),
      by_user: sorted,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
