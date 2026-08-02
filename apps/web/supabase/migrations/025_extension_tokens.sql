-- 025_extension_tokens.sql
-- Real credentials for the Chrome extension API.
--
-- Before this, the bearer token for /api/extension/* was literally
-- "jaa_" + clerk_user_id, so anyone who saw a user id (logs, DB rows, support
-- threads) could read and write that user's applications and pipeline leads.
-- Now the extension presents a high-entropy random secret and we store only its
-- SHA-256 hash. The plaintext is shown once, at generation time, and never again.
--
-- SHA-256 (not bcrypt/argon2) is deliberate: the secret is 256 bits of CSPRNG
-- output, so there is no dictionary to attack and no need for a slow KDF. The
-- hash exists to keep a leaked DB dump from yielding usable tokens.

create table if not exists extension_tokens (
  id             uuid        primary key default gen_random_uuid(),
  clerk_user_id  text        not null references profiles(clerk_user_id) on delete cascade,

  -- SHA-256 hex of the full plaintext token (including the "jaa_" prefix).
  token_hash     text        not null unique,

  -- First few plaintext chars, for "which token is this?" display only.
  token_prefix   text        not null,

  label          text,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  revoked_at     timestamptz,

  constraint extension_tokens_hash_is_sha256 check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint extension_tokens_label_len check (label is null or char_length(label) <= 60)
);

-- Active-token lookups per user (settings page list, active-token cap).
create index if not exists idx_extension_tokens_user
  on extension_tokens(clerk_user_id)
  where revoked_at is null;

-- token_hash's unique constraint already provides the auth lookup index.

-- Service-role-only access: RLS on with no policies blocks the anon/authed API.
alter table extension_tokens enable row level security;

comment on table extension_tokens is
  'Hashed API tokens for the Chrome extension. Plaintext is never stored. Service-role only.';
comment on column extension_tokens.token_hash is
  'SHA-256 hex of the full plaintext token. Auth validates by hash lookup, never by user id.';
