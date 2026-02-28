import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString();

    // Fetch cost config
    const { data: config } = await supabase
      .from("cost_config")
      .select("monthly_ai_cap_usd, alert_threshold_pct, block_on_cap")
      .eq("clerk_user_id", userId)
      .single();

    // Fetch this month's AI usage
    const { data: usage } = await supabase
      .from("ai_generations")
      .select(
        "generation_type, model_used, tokens_input, tokens_output, cost_usd, created_at"
      )
      .eq("clerk_user_id", userId)
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false });

    // Fetch active alerts
    const { data: alerts } = await supabase
      .from("expense_alerts")
      .select("*")
      .eq("clerk_user_id", userId)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(5);

    const records = usage ?? [];
    const totalSpend = records.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    const totalCalls = records.length;
    const totalInputTokens = records.reduce(
      (s, r) => s + (r.tokens_input ?? 0),
      0
    );
    const totalOutputTokens = records.reduce(
      (s, r) => s + (r.tokens_output ?? 0),
      0
    );

    // Spend by type
    const byType: Record<string, { count: number; cost: number }> = {};
    for (const r of records) {
      const t = r.generation_type ?? "unknown";
      if (!byType[t]) byType[t] = { count: 0, cost: 0 };
      byType[t].count++;
      byType[t].cost += r.cost_usd ?? 0;
    }

    // Daily trend (last 30 days)
    const dailyTrend: Record<string, number> = {};
    for (const r of records) {
      const day = r.created_at.slice(0, 10);
      dailyTrend[day] = (dailyTrend[day] ?? 0) + (r.cost_usd ?? 0);
    }

    // Monthly projection
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();
    const projectedMonthly =
      dayOfMonth > 0 ? (totalSpend / dayOfMonth) * daysInMonth : 0;

    const cap = config?.monthly_ai_cap_usd ?? 10.0;

    return NextResponse.json({
      cap,
      alert_threshold_pct: config?.alert_threshold_pct ?? 80,
      block_on_cap: config?.block_on_cap ?? true,
      total_spend: Math.round(totalSpend * 100) / 100,
      total_calls: totalCalls,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      spend_by_type: byType,
      daily_trend: dailyTrend,
      projected_monthly: Math.round(projectedMonthly * 100) / 100,
      percent_used: Math.round((totalSpend / cap) * 100),
      alerts: alerts ?? [],
      recent_calls: records.slice(0, 20),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
