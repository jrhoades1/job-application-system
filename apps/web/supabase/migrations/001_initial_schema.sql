-- ============================================================
-- Job Application Assistant — Initial Schema
-- Run in Supabase SQL Editor on project creation
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: profiles
-- User resume, skills, achievements, and career narrative
-- ============================================================
CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id   TEXT NOT NULL UNIQUE,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  location        TEXT,
  linkedin_url    TEXT,
  portfolio_url   TEXT,

  -- Master content (achievements by category, career narrative)
  achievements    JSONB NOT NULL DEFAULT '[]',
  narrative       TEXT,
  base_resume_url TEXT,

  -- Job search preferences
  preferences     JSONB NOT NULL DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_clerk_user_id ON profiles(clerk_user_id);

-- ============================================================
-- TABLE: applications
-- Full application tracking (maps to metadata.json schema)
-- ============================================================
CREATE TABLE applications (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id         TEXT NOT NULL,

  -- Core fields
  company               TEXT NOT NULL,
  role                  TEXT NOT NULL,
  location              TEXT,
  compensation          TEXT,
  applied_date          DATE,
  source                TEXT,
  source_url            TEXT,
  status                TEXT NOT NULL DEFAULT 'evaluating'
                        CHECK (status IN (
                          'evaluating', 'pending_review', 'ready_to_apply',
                          'applied', 'interviewing', 'offered',
                          'rejected', 'withdrawn', 'accepted'
                        )),
  follow_up_date        DATE,
  contact               TEXT DEFAULT '',
  notes                 TEXT DEFAULT '',

  -- Document references
  resume_version        TEXT,
  cover_letter          TEXT,
  job_description       TEXT,

  -- Metadata
  former_employer       BOOLEAN NOT NULL DEFAULT FALSE,
  tailoring_intensity   TEXT CHECK (tailoring_intensity IN ('light', 'moderate', 'heavy')),

  -- Interview tracking
  interview_date        DATE,
  interview_round       INTEGER,
  interview_type        TEXT,
  interview_notes       TEXT,

  -- Rejection tracking
  rejection_date        DATE,
  rejection_reason      TEXT,
  rejection_insights    TEXT,

  -- Offer data
  offer                 JSONB,
  offer_accepted        BOOLEAN,

  -- Learning loop
  learning_flags        TEXT[] DEFAULT '{}',

  -- Pipeline fields
  email_uid             TEXT,
  pipeline_batch        TEXT,
  skip_date             DATE,
  skip_reason           TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applications_clerk_user_id ON applications(clerk_user_id);
CREATE INDEX idx_applications_status ON applications(clerk_user_id, status);
CREATE INDEX idx_applications_applied_date ON applications(clerk_user_id, applied_date DESC);

-- ============================================================
-- TABLE: match_scores
-- Scoring breakdown per application
-- ============================================================
CREATE TABLE match_scores (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id         UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  clerk_user_id          TEXT NOT NULL,

  overall                TEXT NOT NULL CHECK (overall IN ('strong', 'good', 'stretch', 'long_shot')),
  match_percentage       REAL,
  strong_count           INTEGER DEFAULT 0,
  partial_count          INTEGER DEFAULT 0,
  gap_count              INTEGER DEFAULT 0,

  requirements_matched   JSONB DEFAULT '[]',
  requirements_partial   JSONB DEFAULT '[]',
  gaps                   JSONB DEFAULT '[]',
  addressable_gaps       JSONB DEFAULT '[]',
  hard_gaps              JSONB DEFAULT '[]',
  keywords               TEXT[] DEFAULT '{}',
  red_flags              TEXT[] DEFAULT '{}',

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(application_id)
);

CREATE INDEX idx_match_scores_application ON match_scores(application_id);
CREATE INDEX idx_match_scores_overall ON match_scores(clerk_user_id, overall);

-- ============================================================
-- TABLE: pipeline_leads
-- Staging for email-sourced job leads before promotion
-- ============================================================
CREATE TABLE pipeline_leads (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id         TEXT NOT NULL,

  company               TEXT NOT NULL,
  role                  TEXT NOT NULL,
  source_platform       TEXT,
  email_uid             TEXT,
  email_date            TIMESTAMPTZ,
  raw_subject           TEXT,
  confidence            REAL,

  career_page_url       TEXT,
  description_text      TEXT,
  ats_type              TEXT,

  score_overall          TEXT CHECK (score_overall IN ('strong', 'good', 'stretch', 'long_shot')),
  score_match_percentage REAL,
  score_details          JSONB,

  status                TEXT NOT NULL DEFAULT 'pending_review'
                        CHECK (status IN ('pending_review', 'promoted', 'skipped', 'auto_skipped')),
  skip_reason           TEXT,
  promoted_application_id UUID REFERENCES applications(id),

  pipeline_batch        TEXT,
  location              TEXT,
  remote_status         TEXT,
  compensation          TEXT,
  red_flags             TEXT[] DEFAULT '{}',
  rank                  INTEGER,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipeline_leads_clerk_user_id ON pipeline_leads(clerk_user_id);
CREATE INDEX idx_pipeline_leads_status ON pipeline_leads(clerk_user_id, status);

-- ============================================================
-- TABLE: ai_generations (from DSF cost-tracking skill)
-- Audit log for every AI API call
-- ============================================================
CREATE TABLE ai_generations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id     TEXT NOT NULL,
  application_id    UUID REFERENCES applications(id) ON DELETE SET NULL,

  generation_type   TEXT NOT NULL,
  model_used        TEXT NOT NULL,
  tokens_input      INTEGER NOT NULL DEFAULT 0,
  tokens_output     INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL DEFAULT 0,

  input_summary     TEXT,
  output_summary    TEXT,
  duration_ms       INTEGER,
  error             TEXT,
  cached_tokens     INTEGER DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_gen_user ON ai_generations(clerk_user_id);
CREATE INDEX idx_ai_gen_user_month ON ai_generations(clerk_user_id, created_at);

-- ============================================================
-- TABLE: expense_alerts (from DSF cost-tracking skill)
-- ============================================================
CREATE TABLE expense_alerts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id     TEXT NOT NULL,

  alert_type        TEXT NOT NULL,
  severity          TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  threshold_value   REAL NOT NULL,
  actual_value      REAL NOT NULL,
  message           TEXT NOT NULL,

  resolved          BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at       TIMESTAMPTZ,
  resolution        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_user ON expense_alerts(clerk_user_id);
CREATE INDEX idx_alerts_unresolved ON expense_alerts(clerk_user_id, resolved) WHERE resolved = FALSE;

-- ============================================================
-- TABLE: cost_config (from DSF cost-tracking skill)
-- ============================================================
CREATE TABLE cost_config (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id       TEXT NOT NULL UNIQUE,

  monthly_ai_cap_usd  REAL NOT NULL DEFAULT 10.00,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
  single_call_alert   REAL NOT NULL DEFAULT 0.50,
  block_on_cap        BOOLEAN NOT NULL DEFAULT TRUE,
  email_on_high       BOOLEAN NOT NULL DEFAULT TRUE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_config_user ON cost_config(clerk_user_id);

-- ============================================================
-- TABLE: email_connections (Phase 3 — Gmail OAuth)
-- ============================================================
CREATE TABLE email_connections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id   TEXT NOT NULL UNIQUE,
  email_address   TEXT NOT NULL,
  oauth_token     TEXT,
  last_fetch_at   TIMESTAMPTZ,
  last_fetch_uid  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_connections_clerk ON email_connections(clerk_user_id);

-- ============================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cost_config_updated_at
  BEFORE UPDATE ON cost_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_connections_updated_at
  BEFORE UPDATE ON email_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
