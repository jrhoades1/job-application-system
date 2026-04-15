-- Migration 013: Enable RLS on insight_notifications
--
-- Migration 012 created the table without RLS, violating the project's
-- security standards. Every table in the public schema must have RLS
-- enabled (see .claude/rules/security-standards.md).
--
-- Pattern used across this project: RLS enabled + zero policies. Queries
-- from supabase-js clients using the service-role key bypass RLS and
-- continue to work unchanged. Queries using the anon key (client-side,
-- unauthenticated) are blocked entirely.

ALTER TABLE insight_notifications ENABLE ROW LEVEL SECURITY;

-- No policies are intentionally defined. All access goes through the
-- server-side service-role client in @/lib/supabase, which bypasses RLS.
