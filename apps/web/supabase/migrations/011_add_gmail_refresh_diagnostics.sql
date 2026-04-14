ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS last_refresh_error text,
  ADD COLUMN IF NOT EXISTS last_refresh_error_kind text,
  ADD COLUMN IF NOT EXISTS last_refresh_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_failure_count integer NOT NULL DEFAULT 0;
