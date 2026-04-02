import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const stripe = getStripe();

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("clerk_user_id", userId)
      .single();

    if (!sub?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No billing account found" },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") ?? "https://localhost:3002";

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/dashboard/settings?tab=billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
