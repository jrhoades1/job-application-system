import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { getStripe, PLAN_CONFIG, type PlanType } from "@/lib/stripe";

const checkoutSchema = z.object({
  plan: z.enum(["pro", "career_maintenance"]),
});

const PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  career_maintenance: process.env.STRIPE_MAINTENANCE_PRICE_ID,
};

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { plan } = parsed.data;
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return NextResponse.json(
        { error: `Price not configured for plan: ${plan}` },
        { status: 500 }
      );
    }

    // Load user email for Stripe customer
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("clerk_user_id", userId)
      .single();

    if (!profile?.email) {
      return NextResponse.json(
        { error: "Profile email required" },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    // Find or create Stripe customer
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("clerk_user_id", userId)
      .single();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: profile.full_name ?? undefined,
        metadata: { clerk_user_id: userId },
      });
      customerId = customer.id;

      // Store customer ID
      await supabase
        .from("subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("clerk_user_id", userId);
    }

    const origin = req.headers.get("origin") ?? "https://localhost:3002";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/settings?tab=billing&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/settings?tab=billing`,
      metadata: {
        clerk_user_id: userId,
        plan_type: plan,
        applications_cap: String(PLAN_CONFIG[plan as PlanType].applicationsCap),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
