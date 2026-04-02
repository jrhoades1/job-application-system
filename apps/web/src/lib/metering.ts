import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanType } from "./stripe";
import { PLAN_CONFIG } from "./stripe";

export interface SubscriptionData {
  plan_type: PlanType;
  applications_cap: number;
  applications_used: number;
  top_off_balance: number;
  billing_period_start: string | null;
  billing_period_end: string | null;
  stripe_customer_id: string | null;
}

export interface QuotaCheck {
  allowed: boolean;
  isNewApplication: boolean;
  used: number;
  cap: number;
  topOff: number;
}

const FREE_DEFAULTS: SubscriptionData = {
  plan_type: "free",
  applications_cap: PLAN_CONFIG.free.applicationsCap,
  applications_used: 0,
  top_off_balance: 0,
  billing_period_start: null,
  billing_period_end: null,
  stripe_customer_id: null,
};

/**
 * Load a user's subscription, returning free-tier defaults if none exists.
 */
export async function getSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriptionData> {
  const { data } = await supabase
    .from("subscriptions")
    .select(
      "plan_type, applications_cap, applications_used, top_off_balance, billing_period_start, billing_period_end, stripe_customer_id"
    )
    .eq("clerk_user_id", userId)
    .single();

  if (!data) return { ...FREE_DEFAULTS };
  return data as SubscriptionData;
}

/**
 * Get the start of the current billing period.
 * For paid plans, uses billing_period_start from Stripe.
 * For free plans, uses the 1st of the current calendar month.
 */
function getBillingPeriodStart(sub: SubscriptionData): string {
  if (sub.billing_period_start) return sub.billing_period_start;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/**
 * Check if the user has quota to use AI features on this application.
 *
 * - If applicationId already has AI generations this billing period, allow (no new app consumed).
 * - If it's a new application, check used < cap + top_off_balance.
 */
export async function checkApplicationQuota(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<QuotaCheck> {
  const sub = await getSubscription(supabase, userId);
  const periodStart = getBillingPeriodStart(sub);

  // Check if this application_id already has AI calls in this billing period
  const { count } = await supabase
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("clerk_user_id", userId)
    .eq("application_id", applicationId)
    .gte("created_at", periodStart);

  const isNewApplication = (count ?? 0) === 0;

  if (!isNewApplication) {
    // Already consumed -- allow freely
    return {
      allowed: true,
      isNewApplication: false,
      used: sub.applications_used,
      cap: sub.applications_cap,
      topOff: sub.top_off_balance,
    };
  }

  // New application -- check quota
  const totalCap = sub.applications_cap + sub.top_off_balance;
  const allowed = sub.applications_used < totalCap;

  return {
    allowed,
    isNewApplication: true,
    used: sub.applications_used,
    cap: sub.applications_cap,
    topOff: sub.top_off_balance,
  };
}

/**
 * Atomically increment applications_used.
 * Uses a WHERE guard to prevent exceeding cap + top_off_balance.
 * Returns true if the increment succeeded, false if quota was exceeded (race condition).
 */
export async function incrementApplicationUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  // Use RPC or raw SQL for atomic increment with guard
  const { data, error } = await supabase.rpc("increment_application_usage", {
    p_clerk_user_id: userId,
  });

  if (error) {
    console.error("Failed to increment application usage:", error);
    return false;
  }

  return data === true;
}
