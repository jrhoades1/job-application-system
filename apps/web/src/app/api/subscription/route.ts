import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { getSubscription } from "@/lib/metering";
import { PLAN_CONFIG } from "@/lib/stripe";

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const sub = await getSubscription(supabase, userId);

    return NextResponse.json({
      plan_type: sub.plan_type,
      plan_label: PLAN_CONFIG[sub.plan_type]?.label ?? "Free",
      applications_used: sub.applications_used,
      applications_cap: sub.applications_cap,
      top_off_balance: sub.top_off_balance,
      total_available: sub.applications_cap + sub.top_off_balance,
      billing_period_end: sub.billing_period_end,
      has_stripe: !!sub.stripe_customer_id,
    });
  } catch (err) {
    console.error("Subscription fetch error:", err);
    return NextResponse.json(
      { error: "Failed to load subscription" },
      { status: 500 }
    );
  }
}
