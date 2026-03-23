-- Migration 008: Add sms_sent_at to digest_runs
--
-- Tracks whether an SMS digest was sent for each nightly run.
-- Used by /api/cron/nightly-pipeline to record delivery and by
-- /api/sms/webhook to look up the top leads referenced in replies.

ALTER TABLE digest_runs
  ADD COLUMN IF NOT EXISTS sms_sent_at timestamptz NULL;
