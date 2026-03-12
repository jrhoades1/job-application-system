-- Add soft delete (deleted_at) to pipeline_leads and applications
-- Records with deleted_at IS NOT NULL are treated as deleted but preserved for audit.

ALTER TABLE pipeline_leads ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE applications ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for fast filtering of active records
CREATE INDEX idx_pipeline_leads_active ON pipeline_leads (clerk_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_applications_active ON applications (clerk_user_id) WHERE deleted_at IS NULL;
