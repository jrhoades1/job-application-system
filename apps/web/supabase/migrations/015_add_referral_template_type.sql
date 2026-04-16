-- Track which outreach template the user sent for a referral.
-- Seeds future "which template gets replies" analytics.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS referral_template_type TEXT DEFAULT NULL
  CHECK (referral_template_type IN ('referral', 'recruiter_ping', 'warm_intro'));
