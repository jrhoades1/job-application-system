# Job Application Assistant

A web application that helps job seekers manage their search with AI-powered analysis, resume tailoring, and application tracking. Built for personal use — deployed on Vercel, data in Supabase.

## Architecture

```
Browser → Clerk (auth) → Next.js API Routes → Supabase (PostgreSQL, service-role)
                                             → Anthropic Claude API (analysis, tailoring)
```

- **Auth:** Clerk (social login + email). No Supabase Auth/RLS — queries use service-role key filtered by `clerk_user_id`.
- **Database:** Supabase PostgreSQL (free tier). 8 tables: profiles, applications, match_scores, pipeline_leads, ai_generations, expense_alerts, cost_config, email_connections.
- **AI:** Anthropic Claude Sonnet 4 for job analysis, resume tailoring, cover letter generation. Cost-tracked via `ai_generations` table with spend caps.
- **UI:** Tailwind CSS + shadcn/ui components. All pages are client components with SWR-style data fetching.

## Conventions

### Naming
- Files: kebab-case (`application-table.tsx`)
- Components: PascalCase (`ApplicationTable`)
- Database tables: snake_case, plural (`match_scores`)
- API endpoints: `/api/resource-name`
- Environment variables: SCREAMING_SNAKE_CASE

### File organization
- `src/app/` — Next.js App Router pages and API routes
- `src/app/api/` — Server-side API routes (today-actions, applications, profile, analyze-job, tailor-resume, generate-cover-letter, pipeline, insights, admin/usage, scrape-job, gmail, webhooks/clerk)
- `src/components/layout/` — Sidebar (4-item nav with badge counts) and header
- `src/components/ui/` — shadcn/ui primitives (auto-generated, 17 components)
- `src/components/jobs/` — Job page components (lead-card, application-table, add-application-dialog, quick-score-dialog)
- `src/components/settings/` — Settings tab components (profile-form, cost-usage)
- `src/hooks/` — Shared hooks (use-gmail-sync)
- `src/lib/` — Utilities and clients (supabase.ts, anthropic.ts, constants.ts)
- `src/scoring/` — TypeScript scoring engine (6 modules ported from job_score.py)
- `src/ai/` — AI prompt templates (analyze-job.ts, tailor-resume.ts, generate-cover-letter.ts)
- `src/schemas/` — Zod validation schemas (application, profile, match-score)
- `src/types/` — TypeScript interfaces (ApplicationRow, ProfileRow, MatchScoreRow, PipelineLeadRow, ApplicationWithScores)
- `tests/scoring/` — Vitest scoring engine tests (21 tests)
- `e2e/` — Playwright E2E tests (11 spec files)
- `supabase/migrations/` — Database migration SQL

### Import patterns
- `@/*` maps to `./src/*`
- Use `@/components/ui/button` for shadcn
- Use `@/lib/supabase` for database client
- Use `@/scoring` for scoring engine (barrel export via index.ts)
- Use `@/ai/analyze-job` for prompt templates

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx vitest run       # Run unit tests (60 tests)
npx playwright test  # Run E2E tests (requires CLERK_TESTING_TOKEN)
```

## Constraints

### Security
- No secrets in code — use .env.local
- SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY are server-only (no NEXT_PUBLIC_ prefix)
- Every Supabase query MUST filter by clerk_user_id
- All API inputs validated with Zod
- AI spend cap: $10/month default, enforced pre-request via cost_config table
- Clerk webhook verified via svix library

### Performance
- API response time < 500ms (excluding AI calls)
- Supabase and Anthropic clients are lazy-initialized (not at module load) to avoid build-time errors
- Root layout uses `force-dynamic` to prevent Clerk issues during static generation

## Navigation (4 views)

| Nav Item | Route | Description |
|---|---|---|
| **Today** | `/dashboard` | Action engine — prioritized urgent/today/week tasks, compact stats bar |
| **Jobs** | `/dashboard/jobs` | Unified job management — 6 stage tabs (New Leads, Evaluating, Applied, Interviewing, Offers, Closed) |
| **Insights** | `/dashboard/insights` | Analytics — conversion funnel, score distribution, rejection patterns |
| **Settings** | `/dashboard/settings` | Tabbed settings (Profile, Gmail, Cost & Usage) |

### Other Pages
| Route | Description |
|---|---|
| `/` | Landing page with sign-in CTA |
| `/sign-in`, `/sign-up` | Clerk auth components |
| `/dashboard/tracker/[id]` | Application detail — edit, interview/rejection panels, AI tools |
| `/dashboard/jobs/[id]` | Alias → redirects to `/dashboard/tracker/[id]` |

### Redirects (old routes)
| Old Route | Redirects To |
|---|---|
| `/dashboard/tracker` | `/dashboard/jobs?tab=evaluating` |
| `/dashboard/pipeline` | `/dashboard/jobs?tab=leads` |
| `/dashboard/profile` | `/dashboard/settings?tab=profile` |
| `/dashboard/admin` | `/dashboard/settings?tab=costs` |
| `/dashboard/analyze` | `/dashboard/jobs` |
| `/dashboard/today` | `/dashboard` |

### API Routes
| Route | Methods | Description |
|---|---|---|
| `/api/today-actions` | GET | Prioritized action queue (urgent/today/week) + stats |
| `/api/applications` | GET, POST | List (filtered) / create applications |
| `/api/applications/[id]` | GET, PUT, DELETE | Single application CRUD |
| `/api/applications/[id]/score` | POST | Score an application |
| `/api/applications/bulk-status` | PATCH | Bulk status update |
| `/api/applications/bulk-import` | POST | Bulk import from URLs |
| `/api/profile` | GET, PUT | User profile |
| `/api/analyze-job` | POST | Algorithmic scoring + AI-enhanced analysis |
| `/api/tailor-resume` | POST | AI resume tailoring (by application_id) |
| `/api/generate-cover-letter` | POST | AI cover letter generation (by application_id) |
| `/api/pipeline/leads` | GET, PATCH | Pipeline leads list / promote or skip |
| `/api/pipeline/rescore` | POST | Re-score a pipeline lead |
| `/api/pipeline/reparse` | POST | Re-parse a pipeline lead email |
| `/api/insights` | GET | Analytics aggregation |
| `/api/admin/usage` | GET | Cost tracking data |
| `/api/scrape-job` | POST | Scrape job listing URL for company/role/description |
| `/api/gmail/connect` | GET | OAuth redirect to connect Gmail |
| `/api/gmail/status` | GET | Gmail connection status |
| `/api/gmail/sync` | POST | Sync emails into pipeline |
| `/api/gmail/disconnect` | DELETE | Disconnect Gmail |
| `/api/dashboard-stats` | GET | Dashboard overview stats |
| `/api/webhooks/clerk` | POST | User sync on signup (creates profile + cost_config) |

## Scoring Engine (`src/scoring/`)

TypeScript port of `job_score.py` (1,119 lines → 6 modules):

| Module | Function | Description |
|---|---|---|
| `extract-requirements.ts` | `extractRequirements()` | Parse JD into hard_requirements, preferred, responsibilities, keywords, red_flags |
| `score-requirement.ts` | `scoreRequirement()` | Score single requirement vs achievements (strong/partial/gap) |
| `calculate-score.ts` | `calculateOverallScore()` | Aggregate to strong/good/stretch/long_shot tier |
| `rank-jobs.ts` | `rankJobs()` | Sort by tier → match% → gaps → name |
| `detect-employment.ts` | `detectEmploymentType()` | Detect full_time/contract/part_time/temp |
| `detect-location.ts` | `detectLocationMatch()` | Detect remote/hybrid/onsite, match preferences |

## AI Integration (`src/ai/` + `src/lib/anthropic.ts`)

All AI calls go through `createTrackedMessage()` which:
1. Checks monthly spend cap from `cost_config`
2. Makes the Anthropic API call (non-streaming, Sonnet 4)
3. Logs to `ai_generations` (model, tokens, cost)
4. Checks alert thresholds, creates `expense_alerts` if needed

Three AI features:
- **Analyze Job** — Two-tier: algorithmic scorer first, then Claude enhances with gap classification
- **Tailor Resume** — Intensity based on match score (light/moderate/heavy)
- **Cover Letter** — 3-4 paragraph structure, company-specific, gap framing

## Cost Tracking (DSF Skill Integration)

Uses the `cost-tracking` skill from `dark-software-factory/.claude/skills/cost-tracking/`. Tables: `ai_generations`, `expense_alerts`, `cost_config`. Accessible via Settings → Cost & Usage tab.

## Environment Variables

| Variable | Purpose | Required | Server-only |
|---|---|---|---|
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk auth (client) | Yes | No |
| CLERK_SECRET_KEY | Clerk auth (server) | Yes | Yes |
| CLERK_WEBHOOK_SECRET | Clerk webhook verification | Yes | Yes |
| SUPABASE_URL | Supabase connection | Yes | Yes |
| SUPABASE_SERVICE_ROLE_KEY | Supabase admin access | Yes | Yes |
| ANTHROPIC_API_KEY | Claude AI API | Yes | Yes |

## Deployment

1. Create Clerk app → copy keys
2. Create Supabase project → run `supabase/migrations/001_initial_schema.sql` → copy keys
3. Get Anthropic API key
4. Push to GitHub → connect to Vercel → add all env vars
5. Set Clerk webhook URL to `https://your-app.vercel.app/api/webhooks/clerk`
6. Set Vercel Spend Management budget cap (Settings → Billing)
