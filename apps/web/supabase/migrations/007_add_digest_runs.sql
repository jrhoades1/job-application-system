-- Migration 007: Add digest_runs table for "Jobs Come to You" feature
--
-- Stores the result of each nightly pipeline run per user.
-- Used by GET /api/digest to surface the morning digest banner.

CREATE TABLE IF NOT EXISTS digest_runs (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id     text          NOT NULL,
  run_date          date          NOT NULL,
  emails_fetched    int           NOT NULL DEFAULT 0,
  leads_created     int           NOT NULL DEFAULT 0,
  above_threshold   int           NOT NULL DEFAULT 0,
  top_leads         jsonb         NOT NULL DEFAULT '[]',
  digest_sent_at    timestamptz   NULL,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

-- Index for fast per-user lookups sorted by date
CREATE INDEX IF NOT EXISTS digest_runs_user_date
  ON digest_runs (clerk_user_id, run_date DESC);

-- Prevent duplicate runs for the same user on the same date
CREATE UNIQUE INDEX IF NOT EXISTS digest_runs_user_date_unique
  ON digest_runs (clerk_user_id, run_date);
