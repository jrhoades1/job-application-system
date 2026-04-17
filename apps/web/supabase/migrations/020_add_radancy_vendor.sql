-- Migration 020: Add 'radancy' to the target_companies.ats_vendor CHECK constraint
--
-- The original check constraint from migration 013_career_scan.sql only listed
-- the vendors we had names for at the time. Radancy / TalentBrew / Magic Bullet
-- support shipped in commit 5152f2a; this migration updates the constraint so
-- insert("ats_vendor", "radancy") isn't rejected at the DB layer.

ALTER TABLE target_companies
  DROP CONSTRAINT IF EXISTS target_companies_ats_vendor_check;

ALTER TABLE target_companies
  ADD CONSTRAINT target_companies_ats_vendor_check
  CHECK (ats_vendor = ANY (ARRAY[
    'greenhouse'::text,
    'lever'::text,
    'ashby'::text,
    'smartrecruiters'::text,
    'workday'::text,
    'icims'::text,
    'radancy'::text,
    'generic_llm'::text
  ]));
