-- Add referral_status to track whether the user has found an insider contact
-- Replaces the old follow_up_date auto-set behavior on apply
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS referral_status TEXT DEFAULT NULL
  CHECK (referral_status IN ('pending', 'contacted', 'connected', 'skipped'));

-- Index for today-actions query filtering
CREATE INDEX IF NOT EXISTS idx_applications_referral_status
  ON applications (clerk_user_id, referral_status)
  WHERE deleted_at IS NULL AND referral_status IS NOT NULL;
