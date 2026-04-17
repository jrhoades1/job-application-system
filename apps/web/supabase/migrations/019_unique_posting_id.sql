-- 018_unique_posting_id.sql
-- After 017 has removed active duplicates, enforce uniqueness at the DB layer.
-- Partial indexes: only active (non-deleted) rows with a non-null posting_id
-- participate, so soft-deleting lets a user re-apply later if they really want.

-- Drop the non-unique lookup indexes from 016; the unique ones supersede them.
DROP INDEX IF EXISTS public.pipeline_leads_posting_id_idx;
DROP INDEX IF EXISTS public.applications_posting_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_leads_posting_id_unique
  ON public.pipeline_leads (clerk_user_id, posting_id)
  WHERE deleted_at IS NULL AND posting_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS applications_posting_id_unique
  ON public.applications (clerk_user_id, posting_id)
  WHERE deleted_at IS NULL AND posting_id IS NOT NULL;
