# CLAUDE.md — Job Application System (Monorepo)

> Address the developer as **Jimmy**. DSF project: JOB-APPLICATIONS.

## Core Philosophy

> **DSF Motto:** Eliminate the human from the loop. Every process should trend toward full automation.

- **Autonomy first** — if a request adds human intervention, flag it and propose an automated alternative
- Security is not optional — if uncertain, fail closed
- If a decision trades convenience for security, choose security
- If complexity increases attack surface, simplify
- Think step-by-step before writing any code
- Ask Jimmy for clarification before writing large amounts of code if ambiguous
- Prefer smaller, focused functions (<150 lines) — easier to review for security flaws and comprehend at a glance. Composition over inheritance

## Planning (Before Writing Any Code)

1. Understand the task completely
2. Check `.claude/skills/` or `skills/` for an existing skill that matches the task
3. Check `requirements/` for existing specs
4. Review existing patterns in the codebase
5. For data handling, tools, or user input: perform quick security assessment
6. Ask Jimmy for clarification if anything is unclear

## How to Operate

1. **Find the skill first** — Check `skills/` before starting any task. Don't improvise when a skill exists.
2. **Check existing code** — Before writing new code, check what already exists. Don't duplicate.
3. **Use context for quality** — Reference `context/` and `master/` files for business knowledge.
4. **Model routing for cost** — Use `model:` frontmatter in skill files to route to cheaper models when Opus isn't needed.
5. **Log notable events** — Append decisions and completed tasks to today's daily log.

## Model Selection

- **Haiku** — Mechanical file operations, data formatting, deterministic tasks.
- **Sonnet** — Structured extraction, pattern matching, scoring, code generation, standard analysis. The workhorse.
- **Opus** — Persuasive writing, nuanced reasoning, creative positioning, strategic advice, complex multi-step analysis.

Don't default to Opus out of caution. Be honest about what each task actually requires.

## Session Start

Every new conversation begins with the session-start protocol (see `.claude/rules/session-start.md`). Run `python3 hooks/session_status.py`, read memory + logs, give Jimmy a quick briefing, ask what to work on.

During session: append notable events, decisions, and completed tasks to today's log.

## Guardrails & Security

See `.claude/rules/guardrails.md` for safety rules and `.claude/rules/security-standards.md` for the full security standards. Key principle: when uncertain about intent, ask rather than guess.

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

13 skills for the full application lifecycle: intake, scoring, resume tailoring,
cover letter writing, company research, interview prep, offer evaluation, analytics,
email pipeline. Each skill has `SKILL.md` + `references/` + `evals/`.

## Key Commands

- Score pipeline: `python job_score.py`
- Fetch emails: `python email_fetch.py`
- Parse emails: `python email_parse.py`
- Web dev: `cd apps/web && npm run dev`
- Web tests: `cd apps/web && npx vitest run`
