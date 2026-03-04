-- Add work_history JSONB column to profiles
-- Stores array of {company, title, start_date, end_date, current}
-- Used by resume tailoring to produce accurate job titles and dates
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS work_history JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN profiles.work_history IS 'Array of {company, title, start_date, end_date, current} objects for resume generation';
