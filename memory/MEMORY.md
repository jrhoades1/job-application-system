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
- master/ — Master resume, achievements.md, narrative.md, interview-learnings.md
- swooped_export/ — Swooped platform data
- system-gaps.md — Canonical roadmap for system improvements (Phases 1-4 complete)

## Related Projects
- **job-app-assistant** — **ARCHIVED / DO NOT EDIT.** The standalone repo at `C:\Users\Tracy\Projects\job-app-assistant` (branch `master`) is STALE. The real web app code lives at `apps/web/` in THIS monorepo (branch `main`). Vercel deploys from monorepo `main`. NEVER edit `job-app-assistant` — always edit `apps/web/`.
- **dark-software-factory** — DSF methodology repo. cost-tracking skill created here, used by job-app-assistant.

## Rules (Jimmy-stated)
- **Always preserve the resume and cover letter that were actually submitted.** Never regenerate or overwrite them. If the company responds, we need exactly what was sent.

## Learned Behaviors
- **Git branches:** Single branch `main`. Vercel deploys from `main`. Push directly to `origin main`.
- pipeline_config.json contains credentials — never commit
- Check existing pipeline state before processing new applications
- settings.local.json hooks use relative paths — break when CWD changes (e.g., to job-app-assistant). Use absolute paths.
- shadcn `toast` component is deprecated — use `sonner`
- Clerk v5+ uses `clerkMiddleware` not `authMiddleware`
- Package renamed from `shadcn-ui` to `shadcn`
- Supabase/Anthropic clients must be lazy-initialized in Next.js (avoid build-time env var errors)
- Next.js root layout needs `force-dynamic` when using ClerkProvider
- **Supabase DB:** Project ref `whlfknhcueovaelkisgp`, free tier nano. No direct psql access (IPv6 only, no psql installed). Run DDL via Supabase SQL Editor in browser. Service role key in `.env.local`.
- **Supabase schema:** `applications` table has `interviews` JSONB (array of rounds) and `resources` JSONB (array of links) — added 2026-03-05
- **Interview learning loop:** debrief skill extracts achievements + tactical learnings → `master/interview-learnings.md` accumulates by category → prep builder consumes proven lessons. Dashboard shows purple debrief reminders.
