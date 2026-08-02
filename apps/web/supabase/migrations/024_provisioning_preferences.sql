-- 024_provisioning_preferences.sql
-- Let an allowlist row carry the new user's Bullseye preferences so their
-- profile is configured at signup instead of after. Merged into profiles.preferences
-- by the Clerk user.created webhook.

alter table provisioning_overrides
  add column if not exists preferences jsonb not null default '{}'::jsonb;

comment on column provisioning_overrides.preferences is
  'Bullseye preferences merged into profiles.preferences at signup. {} means leave defaults.';
