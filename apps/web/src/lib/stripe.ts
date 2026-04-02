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

/** Plan configuration -- single source of truth for tier limits */
export const PLAN_CONFIG = {
  free: { applicationsCap: 3, label: "Free" },
  pro: { applicationsCap: 30, label: "Pro" },
  career_maintenance: { applicationsCap: 5, label: "Career Maintenance" },
} as const;

export type PlanType = keyof typeof PLAN_CONFIG;

/** Top-off pack: $5 = 10 applications */
export const TOP_OFF_APPLICATIONS = 10;
