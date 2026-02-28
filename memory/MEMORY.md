# Persistent Memory

> Curated long-term facts. Read at session start. Keep under ~200 lines.

## Identity
- Project: Job Application Pipeline
- Project Code: JOB-APPLICATIONS
- Developer: Jimmy
- Billing: Internal

## Stack
- Language: Python 3
- Key scripts: career_search.py, email_fetch.py, email_parse.py, job_score.py
- Data: pipeline/ directory for staging, applications/ for processed apps

## Key Paths
- applications/ — Processed job applications (333+ with metadata.json)
- pipeline/ — Staging and processing data
- master/ — Master resume and templates (achievements.md, narrative.md)
- swooped_export/ — Swooped platform data
- job-application-system/ — Git submodule with 12 AI skills

## Related Projects
- **job-app-assistant** (`C:\Users\Tracy\Projects\job-app-assistant`) — Web app for daughter. Next.js + Clerk + Supabase + Anthropic. Scoring logic ported from job_score.py to TypeScript. All 4 phases built (MVP, AI, pipeline, insights). 22 routes, 21 tests. Needs Clerk/Supabase/Anthropic keys + Vercel deploy to go live.
- **dark-software-factory** — DSF methodology repo. cost-tracking skill created here, used by job-app-assistant.

## Learned Behaviors
- pipeline_config.json contains credentials — never commit
- Check existing pipeline state before processing new applications
- settings.local.json hooks use relative paths — break when CWD changes (e.g., to job-app-assistant). Use absolute paths.
- shadcn `toast` component is deprecated — use `sonner`
- Clerk v5+ uses `clerkMiddleware` not `authMiddleware`
- Package renamed from `shadcn-ui` to `shadcn`
- Supabase/Anthropic clients must be lazy-initialized in Next.js (avoid build-time env var errors)
- Next.js root layout needs `force-dynamic` when using ClerkProvider
