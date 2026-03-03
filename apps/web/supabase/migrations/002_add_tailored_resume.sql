-- Add tailored_resume column to store actual resume content
-- (resume_version stays as a label, tailored_resume holds the text)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS tailored_resume TEXT;
