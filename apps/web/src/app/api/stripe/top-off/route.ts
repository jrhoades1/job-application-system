import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { getStripe, TOP_OFF_APPLICATIONS } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const stripe = getStripe();

    const priceId = process.env.STRIPE_TOPOFF_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: "Top-off price not configured" },
        { status: 500 }
      );
    }

    // Must have a Stripe customer (i.e., be a paying user or have checked out before)
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("clerk_user_id", userId)
      .single();

    if (!sub?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No billing account found. Please subscribe to a plan first." },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") ?? "https://localhost:3002";

    const session = await stripe.checkout.sessions.create({
      customer: sub.stripe_customer_id,
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/settings?tab=billing&top_off=success`,
      cancel_url: `${origin}/dashboard/settings?tab=billing`,
      metadata: {
        clerk_user_id: userId,
        type: "top_off",
        applications: String(TOP_OFF_APPLICATIONS),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe top-off error:", err);
    return NextResponse.json(
      { error: "Failed to create top-off session" },
      { status: 500 }
    );
  }
}
