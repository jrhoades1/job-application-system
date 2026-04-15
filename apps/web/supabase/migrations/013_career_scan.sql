-- Migration 013: Career page scan
--
-- Proactive job discovery: user names target companies, system polls their
-- careers pages hourly and seeds new listings as pipeline_leads. Complements
-- the reactive email pipeline.

CREATE TABLE IF NOT EXISTS target_companies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id    TEXT NOT NULL,

  company_name     TEXT NOT NULL,
  careers_url      TEXT NOT NULL,
  ats_vendor       TEXT NOT NULL
                   CHECK (ats_vendor IN (
                     'greenhouse', 'lever', 'ashby', 'smartrecruiters',
                     'workday', 'icims', 'generic_llm'
                   )),
  ats_identifier   TEXT NOT NULL,

  active           BOOLEAN NOT NULL DEFAULT true,
  last_scanned_at  TIMESTAMPTZ,
  last_error       TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (clerk_user_id, ats_vendor, ats_identifier)
);

CREATE INDEX IF NOT EXISTS idx_target_companies_user
  ON target_companies (clerk_user_id, active);

CREATE INDEX IF NOT EXISTS idx_target_companies_scan_queue
  ON target_companies (active, last_scanned_at NULLS FIRST);

-- One row per (target_company, job) per scan. Used to diff runs.
CREATE TABLE IF NOT EXISTS company_job_snapshots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_company_id  UUID NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,

  job_external_id    TEXT NOT NULL,
  title              TEXT NOT NULL,
  location           TEXT,
  department         TEXT,
  url                TEXT NOT NULL,

  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at         TIMESTAMPTZ,

  UNIQUE (target_company_id, job_external_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_company_active
  ON company_job_snapshots (target_company_id)
  WHERE removed_at IS NULL;

-- Observability for each scan run — surfaces scraper breakage early.
CREATE TABLE IF NOT EXISTS career_scan_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_company_id  UUID NOT NULL REFERENCES target_companies(id) ON DELETE CASCADE,

  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at        TIMESTAMPTZ,

  jobs_found         INTEGER NOT NULL DEFAULT 0,
  jobs_new           INTEGER NOT NULL DEFAULT 0,
  jobs_removed       INTEGER NOT NULL DEFAULT 0,

  status             TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'success', 'failed')),
  error_message      TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_runs_company
  ON career_scan_runs (target_company_id, started_at DESC);
