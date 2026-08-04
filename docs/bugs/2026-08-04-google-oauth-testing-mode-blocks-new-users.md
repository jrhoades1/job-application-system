# BUG: Google OAuth blocks every new user — consent screen is stuck in "Testing"

**Reported by:** New user during first-time setup
**Date:** 2026-08-04
**Severity:** High — blocks onboarding for every new user, and silently degrades the existing Gmail connection
**Status:** Open — fix is a console change, not a code change
**Area:** `apps/web/src/app/api/gmail/connect/route.ts`, Google Cloud OAuth consent screen, `docs/new-user-setup.md`

---

## What happened

The user was working through new-user setup with a freshly created Gmail account
(`<new-user-email>`) and hit a hard stop at the Google authorization
screen. She never reached a consent prompt — Google refused before it rendered.

Verbatim error:

> **Access blocked: job-applications-three.vercel.app has not completed the Google verification process**
>
> job-applications-three.vercel.app has not completed the Google verification
> process. The app is currently being tested, and can only be accessed by
> developer-approved testers. If you think you should have access, contact the
> developer.
>
> Error 403: access_denied

## Repro

1. Sign in to https://job-applications-three.vercel.app as a user whose Google
   address has never authorized this app.
2. Trigger the Google OAuth flow (`Settings → Gmail → Connect`, which redirects
   to `/api/gmail/connect`).
3. Pick the new Google account at the account chooser.
4. Google returns `403 access_denied` instead of the consent screen.

Reproduces for any Google account not on the test-user list. Jimmy's own
accounts work, which is exactly why this went unnoticed.

## Root cause

This is not an application defect. The Google Cloud OAuth client behind
`GOOGLE_CLIENT_ID` has its **consent screen publishing status set to "Testing"**.
In that state Google only issues tokens to accounts explicitly added to the
project's **Test users** list — everyone else gets `403 access_denied` before
consent. `<new-user-email>` is not on that list.

The error text is Google's standard wording for Testing-mode publishing status,
not a signal that a verification submission was rejected or is pending.

Relevant code — the flow is correct, it just points at an unpublished client:

```ts
// apps/web/src/app/api/gmail/connect/route.ts:5-8
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");
```

One caveat worth confirming rather than assuming: if Clerk's Google social login
is configured with *custom* credentials from this same Google Cloud project, the
sign-in path hits the identical wall. Either way it is the same consent screen
and the same fix. Note that `docs/new-user-setup.md:28` documents the Clerk
sign-in failure mode as a different message ("You are not allowed to access this
application"), which is what points at the Gmail path here.

## Second-order impact — this is probably not just an onboarding problem

Two consequences of Testing mode that affect the *working* installation:

1. **Refresh tokens expire after 7 days.** Google expires refresh tokens issued
   by an app in Testing status (external user type) after one week. Any Gmail
   connection made under this client dies on a rolling weekly basis and has to
   be re-consented. This is worth checking against the recurring Gmail 401 drift
   this project has chased more than once — it is a distinct third cause from
   the two already diagnosed (refresh drift, orphaned `GOOGLE_CLIENT_SECRET` in
   Vercel), and it cannot be fixed in code.

2. **The 100-test-user cap** is a real ceiling on how many people can ever use
   the Gmail feature while the client stays unpublished.

## Fix

### Immediate (unblocks the user in about a minute)

Google Cloud project `job-app-assistant-489114` (OAuth client
`job-app-assistant-web`, client ID prefix `904968410050-a56m…` — verify this
still matches the `GOOGLE_CLIENT_ID` in Vercel before acting; that pairing was
last confirmed in April 2026) → **APIs & Services → OAuth consent screen →
Audience → Test users → Add users** → `<new-user-email>`. Takes
effect immediately; retry the connect flow.

This is an admin action. The end user cannot do it from her side.

### Durable

Publishing to Production is **not** a free toggle here.
`https://www.googleapis.com/auth/gmail.modify` is a **restricted** scope, so
going to Production requires Google brand verification plus an annual
third-party security assessment (CASA) for restricted-scope access. For a
three-person personal tool that is disproportionate. Realistic options, roughly
in order of effort:

1. **Stay in Testing and treat the test-user list as a fourth allowlist.** Cheap
   and honest, but keeps the 7-day refresh token expiry — meaning Gmail sync
   will keep breaking weekly for everyone, forever. Only acceptable if the
   weekly re-consent is understood and accepted.
2. **Switch to `gmail.readonly`** — still restricted, so it does not avoid
   verification. Check whether the app actually needs `modify`; if nothing
   writes labels or marks messages read, narrowing the scope is good hygiene
   regardless, but it does not by itself solve this.
3. **Set the OAuth client's user type to Internal.** Only possible with a Google
   Workspace org, and only covers accounts in that org. Does not help personal
   `@gmail.com` addresses.
4. **Publish to Production and go through verification/CASA.** The only path
   that gets non-expiring refresh tokens and unlimited users.

Recommendation: do the immediate fix now to unblock the affected user, then decide between
(1) and (4) with the 7-day expiry cost stated explicitly, because that cost is
currently being paid without being acknowledged anywhere in the docs.

## Documentation gap (fix this alongside)

`docs/new-user-setup.md` says there are **two** allowlists and that both must be
done before the person signs up. There are in fact **three** — the Google Cloud
test-user list is the missing one, and it is missing in two places:

- **Step 5 "Connect Gmail (optional)"** (`docs/new-user-setup.md:91-102`)
  describes Connect as a self-serve click. For any new user it currently fails
  with a 403 and no explanation of who to ask or why.
- **"For the admin"** (`docs/new-user-setup.md:148-176`) enumerates the Clerk
  allowlist and `provisioning_overrides` but never mentions Google Cloud.

Both sections should name the test-user step, say that it is admin-only, and
quote the exact 403 text so the next person can pattern-match it instantly.

## Not-a-fix / things to avoid

- Retrying, using a different browser, or clearing cookies will not help. The
  rejection is server-side at Google and keyed to the account.
- "Contact the developer" in Google's message is not a workflow — there is no
  request mechanism. The admin has to add the address proactively.
- Do not disable or work around the Gmail feature in code. Nothing in the app is
  wrong.
