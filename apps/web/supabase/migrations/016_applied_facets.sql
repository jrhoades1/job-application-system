-- Migration 016: Per-target appliedFacets for Workday career-scan
--
-- Workday's CxS `/jobs` endpoint accepts an `appliedFacets` object that
-- restricts results by jobFamilyGroup, locationMainGroup, timeType, etc.
-- Without this, large tenants (CVS: 15k+ postings) hit the MAX_LISTINGS
-- cap and we truncate the board without ever seeing engineering roles
-- that live past offset 500.
--
-- Shape matches Workday's native format so we can splat straight into
-- the POST body:  {"jobFamilyGroup": ["id1","id2"], "locationMainGroup": ["id3"]}
--
-- Greenhouse ignores this column. When empty, Workday scans behave
-- exactly as before.

ALTER TABLE target_companies
  ADD COLUMN IF NOT EXISTS applied_facets JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Guard against accidental non-object values (arrays, null, etc.)
ALTER TABLE target_companies
  ADD CONSTRAINT target_companies_applied_facets_is_object
  CHECK (jsonb_typeof(applied_facets) = 'object');
