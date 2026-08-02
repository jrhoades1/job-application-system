-- 023_provisioning_overrides.sql
-- Allowlist consulted by the Clerk user.created webhook so specific people are
-- provisioned with elevated limits the moment they sign up. Keeps personal
-- emails out of the repo and removes the manual "go bump their row" step.

create table if not exists provisioning_overrides (
  email               text primary key,
  plan_type           text    not null default 'pro',
  monthly_ai_cap_usd  real    not null default 10.00,
  block_on_cap        boolean not null default true,
  note                text,
  applied_at          timestamptz,
  created_at          timestamptz not null default now(),
  constraint provisioning_overrides_email_lowercase check (email = lower(email)),
  constraint provisioning_overrides_plan_type_valid
    check (plan_type in ('free', 'pro', 'career_maintenance')),
  constraint provisioning_overrides_cap_nonneg check (monthly_ai_cap_usd >= 0)
);

-- Service-role-only access: RLS on with no policies blocks the anon/authed API.
alter table provisioning_overrides enable row level security;

comment on table provisioning_overrides is
  'Email allowlist applied by the Clerk user.created webhook. Service-role only.';
