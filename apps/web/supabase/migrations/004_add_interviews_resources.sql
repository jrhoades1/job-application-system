-- ============================================================
-- Migration 004: Add interviews[] and resources[] columns
-- Supports multi-round interview tracking and recruiter-provided links
-- ============================================================

-- interviews: JSONB array of interview round objects
-- Each element: { round, type, date, interviewer, duration, focus, notes_file, status, outcome }
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS interviews JSONB DEFAULT '[]';

-- resources: JSONB array of recruiter-provided links/materials
-- Each element: { url, title, type, notes }
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '[]';

-- Add comment for documentation
COMMENT ON COLUMN applications.interviews IS 'Array of interview rounds: [{round, type, date, interviewer, duration, focus, notes_file, status, outcome}]';
COMMENT ON COLUMN applications.resources IS 'Recruiter-provided links/materials: [{url, title, type, notes}]';
