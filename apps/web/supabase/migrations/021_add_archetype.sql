-- 021_add_archetype.sql
-- -----------------------------------------------------------------------------
-- Archetype classification columns.
--
-- Archetypes come from packages/scoring-rules/archetypes.yaml. The classifier
-- runs on every application insert (POST /api/applications + bulk-import) and
-- on every pipeline_leads insert (gmail sync + career scan cron). Values are
-- one of: engineering-leadership, ai-applied, data-analytics, platform-sre,
-- founder-minded-ic, security, healthcare-ops, general.
--
-- Backfill: scripts/backfill_archetypes.py re-classifies existing rows.
-- -----------------------------------------------------------------------------

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS archetype TEXT
    CHECK (archetype IN (
      'engineering-leadership', 'ai-applied', 'data-analytics',
      'platform-sre', 'founder-minded-ic', 'security',
      'healthcare-ops', 'general'
    )),
  ADD COLUMN IF NOT EXISTS archetype_confidence NUMERIC(4,3)
    CHECK (archetype_confidence IS NULL OR (archetype_confidence >= 0 AND archetype_confidence <= 1));

ALTER TABLE pipeline_leads
  ADD COLUMN IF NOT EXISTS archetype TEXT
    CHECK (archetype IN (
      'engineering-leadership', 'ai-applied', 'data-analytics',
      'platform-sre', 'founder-minded-ic', 'security',
      'healthcare-ops', 'general'
    )),
  ADD COLUMN IF NOT EXISTS archetype_confidence NUMERIC(4,3)
    CHECK (archetype_confidence IS NULL OR (archetype_confidence >= 0 AND archetype_confidence <= 1));

-- Filter/group performance. Partial index skips null rows (pre-backfill).
CREATE INDEX IF NOT EXISTS idx_applications_archetype
  ON applications (clerk_user_id, archetype)
  WHERE archetype IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_leads_archetype
  ON pipeline_leads (clerk_user_id, archetype)
  WHERE archetype IS NOT NULL;

COMMENT ON COLUMN applications.archetype IS 'Role archetype from classifyArchetype() — null for pre-classification rows';
COMMENT ON COLUMN pipeline_leads.archetype IS 'Role archetype from classifyArchetype() — null for pre-classification rows';
