-- 025_provisioning_profile.sql
-- Let an allowlist row carry parsed resume content (work history, achievements,
-- narrative, contact fields) so a new user's profile is populated at signup.
-- Without this, a new account starts empty and resume tailoring is hard-blocked
-- until they upload a file themselves.
--
-- The webhook whitelists which keys it will copy; see PROFILE_SEED_KEYS in
-- src/app/api/webhooks/clerk/route.ts. clerk_user_id and email are never
-- seedable — they come from Clerk.

alter table provisioning_overrides
  add column if not exists profile jsonb not null default '{}'::jsonb;

comment on column provisioning_overrides.profile is
  'Profile columns seeded at signup (whitelisted keys only). {} means leave empty.';
