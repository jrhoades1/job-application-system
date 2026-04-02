import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getStripe, PLAN_CONFIG, TOP_OFF_APPLICATIONS, type PlanType } from "@/lib/stripe";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe webhook verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabase();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerk_user_id;
        if (!clerkUserId) break;

        if (session.mode === "subscription") {
          // New subscription or plan change
          const planType = (session.metadata?.plan_type ?? "pro") as PlanType;
          const cap = PLAN_CONFIG[planType]?.applicationsCap ?? 30;

          await supabase
            .from("subscriptions")
            .upsert(
              {
                clerk_user_id: clerkUserId,
                plan_type: planType,
                stripe_customer_id: session.customer as string,
                stripe_subscription_id: session.subscription as string,
                applications_cap: cap,
                applications_used: 0,
                top_off_balance: 0,
              },
              { onConflict: "clerk_user_id" }
            );
        } else if (session.mode === "payment") {
          // Top-off purchase
          const apps = parseInt(session.metadata?.applications ?? "0", 10);
          if (apps > 0) {
            const { data: sub } = await supabase
              .from("subscriptions")
              .select("top_off_balance")
              .eq("clerk_user_id", clerkUserId)
              .single();

            await supabase
              .from("subscriptions")
              .update({
                top_off_balance: (sub?.top_off_balance ?? 0) + apps,
              })
              .eq("clerk_user_id", clerkUserId);
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId =
          typeof subRef === "string" ? subRef : subRef?.id;

        if (!subscriptionId) break;

        // Only reset on renewal, not initial invoice
        if (invoice.billing_reason === "subscription_cycle") {
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);
          const item = subscription.items.data[0];

          await supabase
            .from("subscriptions")
            .update({
              applications_used: 0,
              top_off_balance: 0,
              billing_period_start: item
                ? new Date(item.current_period_start * 1000).toISOString()
                : new Date().toISOString(),
              billing_period_end: item
                ? new Date(item.current_period_end * 1000).toISOString()
                : null,
            })
            .eq("stripe_subscription_id", subscriptionId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data
          .object as Stripe.Subscription;

        // Detect plan change by checking price metadata
        const subItem = subscription.items.data[0];
        const priceId = subItem?.price.id;
        let planType: PlanType = "pro";
        if (priceId === process.env.STRIPE_MAINTENANCE_PRICE_ID) {
          planType = "career_maintenance";
        }

        await supabase
          .from("subscriptions")
          .update({
            plan_type: planType,
            applications_cap: PLAN_CONFIG[planType].applicationsCap,
            billing_period_start: subItem
              ? new Date(subItem.current_period_start * 1000).toISOString()
              : null,
            billing_period_end: subItem
              ? new Date(subItem.current_period_end * 1000).toISOString()
              : null,
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data
          .object as Stripe.Subscription;

        await supabase
          .from("subscriptions")
          .update({
            plan_type: "free",
            applications_cap: PLAN_CONFIG.free.applicationsCap,
            stripe_subscription_id: null,
            top_off_balance: 0,
            billing_period_start: null,
            billing_period_end: null,
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        if (customerId) {
          // Find user by stripe_customer_id and create alert
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("clerk_user_id")
            .eq("stripe_customer_id", customerId)
            .single();

          if (sub) {
            await supabase.from("expense_alerts").insert({
              clerk_user_id: sub.clerk_user_id,
              alert_type: "payment_failed",
              severity: "high",
              threshold_value: 0,
              actual_value: (invoice.amount_due ?? 0) / 100,
              message:
                "Your payment failed. Please update your payment method to keep your Pro plan active.",
            });
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error(`Stripe webhook error (${event.type}):`, err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
