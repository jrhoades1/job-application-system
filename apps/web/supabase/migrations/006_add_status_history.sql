-- Status history / audit trail for application lifecycle tracking
CREATE TABLE IF NOT EXISTS application_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX idx_status_history_app ON application_status_history(application_id);
CREATE INDEX idx_status_history_user ON application_status_history(clerk_user_id);
