import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return _stripe;
}

/**
 * Caps at or above this number are treated as "unlimited" by the metering
 * check (it never blocks) and rendered as "Unlimited" in the UI. The $10/mo
 * AI dollar cap in cost_config is what actually gates spend.
 */
export const UNLIMITED_APPLICATIONS = 1_000_000;

/** Plan configuration -- single source of truth for tier limits */
export const PLAN_CONFIG = {
  free: { applicationsCap: UNLIMITED_APPLICATIONS, label: "Free" },
  pro: { applicationsCap: UNLIMITED_APPLICATIONS, label: "Pro" },
  career_maintenance: { applicationsCap: UNLIMITED_APPLICATIONS, label: "Career Maintenance" },
} as const;

export type PlanType = keyof typeof PLAN_CONFIG;

/** Top-off pack: $5 = 10 applications */
export const TOP_OFF_APPLICATIONS = 10;
