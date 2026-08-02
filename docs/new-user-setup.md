# New User Setup

How to get a brand-new person up and running on the Job Application Assistant.

**App:** https://job-applications-three.vercel.app

There are two halves: **what the new user does** (steps 1–6) and **what the admin
does** (the section at the bottom). Do the admin allowlist step *before* the new
user signs up, or their limits will be wrong and need fixing by hand afterward.

---

## For the new user

Work through these in order. Steps 1 and 2 are mandatory — nothing else in the
app produces correct results until your profile has real content in it.

### 1. Create your account

Go to https://job-applications-three.vercel.app and click **Sign in**. Use the
Google button with the email address you were told to use, or sign up with that
email and a password. Either works.

The email matters: your limits are attached to it. If you sign up with a
different address than the one that was allowlisted, you'll land on the default
$10/month AI budget instead of your intended one.

### 2. Upload your resume — do this first

**Settings → Profile → Import from Resume → Upload Resume**

PDF, DOCX, or TXT, up to 4 MB. Claude reads it and fills in your contact
details, work history, and achievements automatically. You'll get a toast
confirming how many roles and achievement categories it imported.

Why this is step one: resume tailoring is **blocked** on an empty profile. Not
degraded — blocked, deliberately. Early on, an empty profile caused the model to
invent a plausible-looking work history that matched the job description, so
there is now a server-side guard that returns an error instead. Scoring also
reads your achievements and work history, so before you upload, every job you
look at will score against nothing.

Once it imports, scroll down and skim the **Work History** section. Those exact
titles and companies get reused verbatim in tailored resumes to prevent
fabrication, so fix anything the parser garbled. Add anything it missed with
**+ Add Position**.

### 3. Set your Bullseye profile

**Settings → Bullseye**

This is what tells the system which jobs are worth showing you. Fields:

| Field | What it does |
|---|---|
| **Target roles** | Comma-separated titles you actually want, e.g. `Director of Engineering, VP of Product`. Drives lead matching. |
| **Minimum salary** | Annual USD floor. Leave blank if you don't want to filter on it. |
| **Remote preference** | Any / Remote only / Hybrid OK / On-site only |
| **Minimum seniority** | Any / Mid / Senior / Lead / Manager / Director / VP / C-Level |
| **Pipeline filtering** | Leave on. Drops obvious non-matches before they reach you. |
| **Minimum match score** | Score floor for a lead to survive filtering. Start permissive and tighten later. |
| **Digest frequency** | Daily (every morning), Weekly (Monday), or Off |
| **Digest email** | Where the digest goes. Blank means in-app only. |

Click **Save** when done. Guessing here is fine — you can retune anytime, and
there's a **Reprocess leads** button that re-runs your filters over leads
already in the pipeline.

### 4. Add target companies

**Settings → Targets**

Each night the system scans the careers pages of the companies on this list and
pulls new postings into your pipeline. The list is per-person — nobody else's
targets carry over to you.

To add one, paste the company's careers URL (e.g.
`https://boards.greenhouse.io/stripe`). The ATS vendor is auto-detected from the
URL. Greenhouse-hosted boards work best and have no rate limits.

Known-good Greenhouse boards to start with: `stripe`, `anthropic`, `brex`,
`databricks`, `coinbase`, `instacart`.

If you add nothing here, nightly scans simply produce nothing — the app still
works, you just won't get automatic leads.

### 5. Connect Gmail (optional)

**Settings → Gmail → Connect**

Authorizes read access to one inbox so job-alert emails and recruiter mail get
pulled in as leads automatically. Connect whichever inbox your job mail actually
lands in.

This is lead *intake* only. Job descriptions never come from email bodies — see
step 6 for where those come from.

You can skip this and add jobs by hand. Everything else works without it.

### 6. Install the Chrome extension

This is how real job descriptions get into the system. The extension reads the
posting directly off the page, which is the only source of JD text the app
trusts — email bodies and AI-generated summaries are not used, because they're
lossy and scoring against a bad JD gives a confidently wrong answer.

1. Get the unpacked extension folder from the person who set up your account
   (it's `apps/extension/dist` in the project).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select that folder.
4. In the app, go to **Settings → Extension**. Copy the **App URL**, then click
   **Generate token**.
5. Copy the token immediately — it is shown once and cannot be retrieved later.
6. Open the extension and paste both into its **App URL** and **API Token**
   fields.

Treat the API token like a password. Anyone who has it can read and write your
job data. If you lose it or think it leaked, go back to **Settings → Extension**,
generate a new token, paste it into the extension, and **Revoke** the old one.
Revoking takes effect immediately.

To use it: open a job posting on LinkedIn or a company careers page and click
the extension to capture the description. It'll match against an existing lead
if there is one, or create a new entry.

---

## Verify it worked

Do these in order. Each one exercises the step above it, so if something's
broken you'll know exactly where.

1. **Settings → Profile** shows your real work history, not an empty list.
2. **Settings → Cost & Usage** shows "Unlimited applications" and your intended
   monthly AI budget — not $10, if you were meant to be on a higher one.
3. Capture one job with the extension, open it, and click **Score**. You should
   get a tier (strong / good / stretch / long shot) with named gaps that
   actually reflect your background.
4. On that same job, run **Tailor Resume**. If it errors saying your profile is
   empty, go back to step 2 — the resume import didn't take.

---

## For the admin

### Before they sign up: allowlist the email

New signups default to the free tier with a **$10/month AI budget**. Application
counts are unlimited for everyone, so that dollar cap is the only thing that
actually gates usage.

To give someone different limits, insert a row **before** they create their
account. The Clerk `user.created` webhook reads this table and applies it at
signup.

```sql
insert into provisioning_overrides (email, plan_type, monthly_ai_cap_usd, block_on_cap, note)
values ('person@example.com', 'pro', 250.00, true, 'why this person gets elevated limits');
```

- `email` must be lowercase (enforced by a CHECK constraint).
- `plan_type` is one of `free`, `pro`, `career_maintenance`.
- `monthly_ai_cap_usd` is the real limit. For reference, the heaviest month of
  normal single-user usage on this system was about $9. A cap in the low
  hundreds is effectively unlimited while still stopping a runaway loop.
- `block_on_cap` should stay `true`. Setting it false removes the only spend
  ceiling in the system.

The table is service-role only (RLS enabled, no policies), so it's not reachable
from the browser. `applied_at` gets stamped when the webhook consumes the row.

### If they already signed up before you allowlisted them

The webhook only fires once, on account creation. Fix it directly:

```sql
update cost_config
   set monthly_ai_cap_usd = 250.00, block_on_cap = true
 where clerk_user_id = (select clerk_user_id from profiles where email = 'person@example.com');

update subscriptions
   set plan_type = 'pro'
 where clerk_user_id = (select clerk_user_id from profiles where email = 'person@example.com');
```

### Optional: pre-seed their Bullseye profile and targets

If you already know what the new user wants, you can fill in steps 3 and 4 for
them so they only have to sign up and upload a resume.

```sql
-- Bullseye preferences
update profiles
   set preferences = preferences || jsonb_build_object(
         'target_roles',        jsonb_build_array('Role One', 'Role Two'),
         'salary_min',          120000,
         'remote_preference',   'remote',      -- remote | hybrid | onsite | any
         'min_role_level',      'senior',
         'lead_filter_enabled', true,
         'digest_frequency',    'daily'        -- daily | weekly | off
       )
 where email = 'person@example.com';

-- Target companies
insert into target_companies (clerk_user_id, company_name, careers_url, ats_vendor, ats_identifier)
select clerk_user_id, 'Stripe', 'https://boards.greenhouse.io/stripe', 'greenhouse', 'stripe'
  from profiles where email = 'person@example.com';
```

### Data isolation

Every table is keyed by `clerk_user_id` and every query filters on it. Users on
the same deployment cannot see each other's applications, leads, scores, or
costs. AI spend is tracked and capped per user, so one person's usage can't
consume another's budget.

Extension tokens are random 256-bit secrets. Only a SHA-256 hash is stored, so
the plaintext exists in exactly two places: your clipboard at generation time
and the extension's local storage. The `/api/extension/*` routes resolve the
user from the matched token row, so knowing someone's account ID gets you
nothing. Tokens can be revoked at any time from **Settings → Extension**, and
minting or revoking one requires a signed-in session — a stolen extension token
cannot be used to mint another.

(Earlier builds used `jaa_` + the account ID as the token, which had no secret
component. Those tokens are rejected outright; anyone still on one has to
generate a real token.)
