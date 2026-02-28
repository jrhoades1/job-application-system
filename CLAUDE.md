# CLAUDE.md — Job Application System (Monorepo)

> Address the developer as **Jimmy**. DSF project: JOB-APPLICATIONS.

## Structure

```
├── apps/web/          Next.js web app (Savannah + Jimmy via browser)
├── skills/            CLI skill definitions (Jimmy via Claude Code)
├── packages/
│   └── scoring-rules/ Shared scoring criteria (YAML — both engines read this)
├── applications/      Application folders (metadata.json + job-description.md per job)
├── pipeline/          Email pipeline staging + review queue
├── tests/             Python tests for CLI scoring
├── hooks/             DSF guardrail hooks
├── data/              SQLite databases
├── memory/            Daily logs + MEMORY.md
├── master/            Resume, achievements, career narrative
├── tracker.xlsx       Application tracking spreadsheet
├── job_score.py       CLI scoring engine (Python)
├── email_fetch.py     Gmail fetch pipeline
├── email_parse.py     Email-to-JD parser
└── career_search.py   Job search automation
```

## Scoring Rules

Scoring criteria live in `packages/scoring-rules/scoring-rules.yaml`. Both:
- **Python** (`job_score.py` → `calculate_overall_score()`)
- **TypeScript** (`apps/web/src/scoring/calculate-score.ts`)

...must stay in sync with this file. If you change thresholds, update all three.

## Web App (`apps/web/`)

- **Stack:** Next.js 16, React 19, Clerk auth, Supabase, Claude Sonnet 4
- **Deploy:** Vercel (root dir set to `apps/web`)
- **Has its own** `CLAUDE.md`, `package.json`, `.env.example`
- **Multi-user:** Data isolated by `clerk_user_id`

## CLI Skills (`skills/`)

12 skills for the full application lifecycle: intake, scoring, resume tailoring,
cover letter writing, interview prep, offer evaluation, analytics, email pipeline.
Each skill has `SKILL.md` + `references/` + `evals/`.

## Key Commands

- Score pipeline: `python job_score.py`
- Fetch emails: `python email_fetch.py`
- Parse emails: `python email_parse.py`
- Web dev: `cd apps/web && npm run dev`
- Web tests: `cd apps/web && npx vitest run`
