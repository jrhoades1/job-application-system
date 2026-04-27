-- Cache extracted JD requirements per application so re-tailoring
-- doesn't re-run the AI extractor (and shift the match% denominator
-- via sampling variance) when the JD hasn't actually changed.
--
-- jd_hash is the SHA-256 of the job description text the requirements
-- were extracted from; if the live job_description hashes differently,
-- callers should re-extract and overwrite both columns.

ALTER TABLE public.match_scores
  ADD COLUMN IF NOT EXISTS extracted_requirements JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS jd_hash TEXT;

COMMENT ON COLUMN public.match_scores.extracted_requirements IS
  'Cached requirements extracted from the JD (string array, hard + preferred merged). Reused on re-tailor when jd_hash matches.';
COMMENT ON COLUMN public.match_scores.jd_hash IS
  'SHA-256 hex digest of the JD text the cached requirements were extracted from. Mismatch ⇒ re-extract.';
