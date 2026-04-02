-- ============================================================
-- Migration 009: Subscriptions & Application Metering
-- Adds Stripe billing support with application-count metering
-- ============================================================

-- ============================================================
-- TABLE: subscriptions
-- Tracks user plan, Stripe IDs, and application usage
-- ============================================================
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id         TEXT NOT NULL UNIQUE,

  plan_type             TEXT NOT NULL DEFAULT 'free'
                        CHECK (plan_type IN ('free', 'pro', 'career_maintenance')),

  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,

  applications_cap      INTEGER NOT NULL DEFAULT 3,
  applications_used     INTEGER NOT NULL DEFAULT 0,
  top_off_balance       INTEGER NOT NULL DEFAULT 0,

  billing_period_start  TIMESTAMPTZ,
  billing_period_end    TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_clerk ON subscriptions(clerk_user_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_customer_id);

-- Reuse the existing update_updated_at_column trigger function
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- INDEX: Efficient metering queries on ai_generations
-- Allows fast "distinct application_id per user per period"
-- ============================================================
CREATE INDEX idx_ai_gen_app_period
  ON ai_generations(clerk_user_id, application_id, created_at);

-- ============================================================
-- FUNCTION: Atomic increment of application usage with guard
-- Returns true if increment succeeded, false if at cap
-- ============================================================
CREATE OR REPLACE FUNCTION increment_application_usage(p_clerk_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE subscriptions
  SET applications_used = applications_used + 1,
      updated_at = NOW()
  WHERE clerk_user_id = p_clerk_user_id
    AND applications_used < applications_cap + top_off_balance
  ;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

-- ============================================================
-- BACKFILL: Create subscription rows for existing users
-- All existing users start on free tier with 3 applications
-- ============================================================
INSERT INTO subscriptions (clerk_user_id, plan_type, applications_cap)
SELECT clerk_user_id, 'free', 3
FROM profiles
WHERE clerk_user_id NOT IN (SELECT clerk_user_id FROM subscriptions);
