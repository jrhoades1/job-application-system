---
id: REQ-004
name: career-ops port — review & demo
status: implemented
priority: high
owner: jimmy
branch: feat/career-ops-port
base: main
created: 2026-04-23
updated: 2026-04-23
---

# career-ops port — review and demo guide

## TL;DR

15 commits on `feat/career-ops-port` that port every tangible win from
`santifer/career-ops` (37k-star Claude Code job-search tool) into this
codebase. Split across two sessions: 5 phases first, 7 slices second.

- **112 new tests** (60 Python + 52 vitest) — all passing
- **1 migration** (021_add_archetype.sql) — requires manual `supabase migration up`
- **1 backfill script** — requires manual run
- **1 extension bump** (v0.2.0 → v0.3.0) — requires chrome://extensions reload
- **Nothing auto-runs** — every mutation is opt-in, gated by human action

Open PR: https://github.com/jrhoades1/job-application-system/pull/new/feat/career-ops-port

## Decision log (what Jimmy picked vs alternatives)

| Decision | Choice | Alternative |
|---|---|---|
| Gap mitigation source | Sonnet per gap (match > cost) | Pattern-matched catalog |
| Company research data | WebSearch + WebFetch OK | API-keyed news providers |
| Form autofill consent | Click-to-fill, rollback, never auto-submit | Full automation |
| Classify-on-write + scoring integration | Classify only (scoring integration was "overkill") | Bundled |
| Textual TUI | Deferred — stdlib-only first pass | Shipped with `textual` dep |

---

## Commits in review order (15 total)

### Session 1 — foundations (5 commits)

```
e26ae2c  feat(doctor): add preflight validator with 8 checks + tests
1540c13  feat(portal-scan): add ATS discovery scanner for new listings
1693b38  feat(skills): add negotiation-coach skill
d2dee5d  feat(scoring): add archetype classifier (Python + TS + YAML)
d79509b  feat(dashboard): add offline operational dashboard
```

### Session 2 — career-ops deep delta (10 commits)

```
98f0dac  feat(archetype): classify on every applications/pipeline_leads insert
766f57a  feat(archetype): backfill script for existing metadata + supabase rows
57f744a  feat(resume-tailor): archetype-driven bullet reorder + keyword injection
da9ded5  feat(portal-scan): lifetime scan-history.tsv dedup ledger
e8faabf  feat(gap-analysis): Sonnet-generated severity + mitigation per gap
9bfb4ec  feat(insights): letter-grade + archetype + weekly-trend distributions
3fb7dc4  feat(auto-pipeline): one-POST orchestrator scrape → score → create
f78d216  feat(company-research): add deep-dive mode with 8-section checklist
8d9d7ef  feat(extension): cached-evaluation autofill with click-to-fill consent
3cf2f81  feat(batch-score): --workers N flag for parallel scoring
```

---

## Review checklist

Work top-down. Every box checked = ready to merge.

### Global gates

- [ ] `git log --oneline main..HEAD` shows 15 commits, all `feat(...)`
- [ ] Every commit has a body with a "Why" paragraph
- [ ] No em dashes in any commit body (em-dashes allowed inside code blocks)
- [ ] `python scripts/doctor.py` returns 0 reds on this branch (env warnings OK)
- [ ] `python -m pytest tests/ -q` → all pass
- [ ] `cd apps/web && npx vitest run` → all pass
- [ ] `cd apps/web && npm run build` → no errors
- [ ] `cd apps/extension && npm run build` → dist built
- [ ] No new dependencies added to either package.json

### Security

- [ ] No `SUPABASE_SERVICE_ROLE_KEY` used client-side (still server-only)
- [ ] Every new `from("applications")` / `from("pipeline_leads")` filters on `clerk_user_id`
- [ ] Migration 021 has CHECK constraints on `archetype` enum
- [ ] Migration 021 creates partial indexes (not full) to keep write cost flat
- [ ] Gap-severity route: 3-layer grounding (prompt + parser + substring check)
- [ ] Gap-severity route: uses `createTrackedMessage` (enforces monthly spend cap)
- [ ] Auto-pipeline: never calls `/api/applications/bulk-status` or submits
- [ ] Extension: no new host permissions in manifest.json

### Per-slice review

#### Phase 1 — doctor (e26ae2c)
- [ ] `scripts/doctor.py` runs in <30s (currently ~9s against your repo)
- [ ] `--json` flag emits valid JSON (pipe to `python -m json.tool` to verify)
- [ ] `--only env,scoring` subset works
- [ ] Exit code 1 on red, 0 on green-or-yellow
- [ ] 16 pytest cases pass

#### Phase 2 — portal scanner (1540c13)
- [ ] `python portal_scan.py --dry-run --since 30d` lists real postings
- [ ] `python portal_scan.py --companies anthropic` narrows correctly
- [ ] `pipeline/portal_targets.yaml` has 11 companies
- [ ] Title blocklist catches "Account Executive", "Intern", "Recruiter"

#### Phase 3 — negotiation-coach (1693b38)
- [ ] `skills/negotiation-coach/SKILL.md` has exactly 3 variant scripts
- [ ] Zero em dashes inside any fenced code block
- [ ] `references/negotiation-frameworks.md` has 12 patterns
- [ ] `default: opus` in frontmatter

#### Phase 4 — archetype classifier (d2dee5d)
- [ ] `packages/scoring-rules/archetypes.yaml` has 7 archetypes
- [ ] Python classifier matches TS classifier on all 8 fixtures
- [ ] Test `test_classify_archetype.py` passes (8 cases)
- [ ] Test `classify-archetype.test.ts` passes (16 cases)
- [ ] Priority field breaks ties (founder-minded-ic beats ai-applied on "Founding AI Engineer")

#### Phase 5 — offline dashboard (d79509b)
- [ ] `python scripts/dashboard.py` runs without network in <5s
- [ ] 5 views render: pipeline / today / decay / archetype / staged
- [ ] `--view archetype` shows the 415-app distribution

#### Slice 1a — classify-on-write (98f0dac)
- [ ] Migration `021_add_archetype.sql` is CHECK-constrained
- [ ] 4 TS write paths hooked: applications POST, bulk-import, gmail sync (3 inserts), career-scan cron
- [ ] `classify-on-write.test.ts` (4 cases) passes
- [ ] No classification happens for rejection-marker / non-job auto-skip inserts

#### Slice 1b — backfill script (766f57a)
- [ ] `python scripts/backfill_archetypes.py --mode metadata --dry-run` classifies 415 apps with 0 errors
- [ ] `--force` re-classifies when archetype already set
- [ ] Supabase mode emits valid JSON payload for SQL editor

#### Slice 1c — resume-tailor reorder (57f744a)
- [ ] `skills/resume-tailor/references/archetype-emphasis.md` has a section per archetype (7)
- [ ] Each section has "Lead with", "Keyword priority", "Demote"
- [ ] SKILL.md references the emphasis doc + reads `metadata.archetype`
- [ ] No bullet is ever deleted (reorder only)

#### Slice 1d — scan-history ledger (da9ded5)
- [ ] `pipeline/scan-history.tsv` header written on first run
- [ ] Re-running scan shows 0 staged / N dup
- [ ] Purging `pipeline/staging/discovered/*.jsonl` still dedupes via ledger

#### Slice 2 — gap severity (e8faabf)
- [ ] `POST /api/applications/:id/gap-analysis` scoped by `clerk_user_id`
- [ ] Sonnet call goes through `createTrackedMessage` (spend-cap enforced)
- [ ] Ungrounded mitigations get `(ungrounded — review before using)` prefix
- [ ] Em dashes in Sonnet output trigger rejection
- [ ] 18 vitest cases pass

#### Slice 3 — insights distributions (9bfb4ec)
- [ ] `GET /api/insights` returns `grade_distribution`, `archetype_distribution`, `weekly_trend`
- [ ] /dashboard/insights renders 3 new cards without recharts (text bars)
- [ ] `weekly_trend` is exactly 12 ISO-week buckets, newest last
- [ ] Bucket boundaries: Monday 00:00 UTC

#### Slice 4 — auto-pipeline (3fb7dc4)
- [ ] `POST /api/auto-pipeline` runs scrape → classify → create → score in sequence
- [ ] On score failure: deletes app + match_scores (rollback)
- [ ] On AI-stage failure: keeps app + score intact (not rolled back)
- [ ] Never calls `/api/applications/bulk-status` (never auto-submits)

#### Slice 5 — deep company research (f78d216)
- [ ] `skills/company-research/references/deep-dive-checklist.md` has 8 sections
- [ ] Section 8 (Risk Flags) marked NEVER skip
- [ ] Auto-triggers for engineering-leadership / ai-applied / founder-minded-ic archetypes
- [ ] Synthesis step produces "Interview opening line"

#### Slice 6 — cached-eval autofill (8d9d7ef)
- [ ] `/api/extension/match-url` returns cover_letter, archetype, score
- [ ] Extension manifest v0.3.0
- [ ] fillGreenhouse/fillLever only populate cover letter textarea when caller passes evaluation
- [ ] No new host_permissions in manifest

#### Slice 7 — batch parallel scoring (3cf2f81)
- [ ] `python scripts/batch_score.py --workers 1` behaves identically to pre-change
- [ ] `--workers N` validates 1-32
- [ ] 11 pytest cases pass including parallel-equivalence check

---

## Deploy checklist (in order)

Run these only after PR review + merge. Each is a mutation with side effects.

### 1. Database migration
```bash
# Review first
cat apps/web/supabase/migrations/021_add_archetype.sql

# Apply (uses supabase MCP; no destructive operations)
cd apps/web && npx supabase db push
```
**Rollback:** `ALTER TABLE applications DROP COLUMN archetype, DROP COLUMN archetype_confidence;` (and same for pipeline_leads)

### 2. Vercel deploy
Pushing to main triggers automatic deploy. **Preview env is broken**
(see memory/project_vercel_preview_env_gap.md) so rely on local dev or
the production alias to verify.

### 3. Backfill existing applications
```bash
# Dry run first to see counts
python scripts/backfill_archetypes.py --mode metadata --dry-run

# Real run (mutates 415 metadata.json files)
python scripts/backfill_archetypes.py --mode metadata

# For Supabase: export rows, then pipe through
# (see docstring in scripts/backfill_archetypes.py for the SQL)
```
**Rollback:** Remove `archetype` and `archetype_confidence` from each
metadata.json via `jq 'del(.archetype, .archetype_confidence)'`.

### 4. Extension reload
```
chrome://extensions → job-applications → Reload
```
The v0.3.0 bump carries the cached-eval autofill. No user action needed
beyond clicking Reload.

### 5. Doctor in CI (optional follow-up)
Wire `python scripts/doctor.py --json` into `.github/workflows/` so
every PR is gated on a green doctor run.

---

## Demo script (10 min walkthrough)

### Setup (30s)
```bash
git fetch origin && git checkout feat/career-ops-port
cd apps/web && npm install  # no new deps, fast
```

### 1. Doctor (1 min)
```bash
python scripts/doctor.py
# Expect: 6 green / 1 yellow / 1 red (env vars missing — your .env.local)
# Fix the red, re-run, watch it go green
```

### 2. Portal scanner (1 min)
```bash
python portal_scan.py --dry-run --since 7d --companies anthropic,stripe
# Expect: ~30 fresh leads, 0 duplicates on rerun
python portal_scan.py --dry-run --since 7d --companies anthropic
cat pipeline/scan-history.tsv | head
# Lifetime ledger has a row per URL ever seen
```

### 3. Archetype classifier (1 min)
```bash
# Python side
python -c "
import sys; sys.path.insert(0, 'packages/scoring-rules')
import classify_archetype as ca
config = ca.load_config()
for t in ['CTO at ilumed', 'Senior AI Engineer', 'Founding Platform Engineer']:
    r = ca.classify_archetype(t, '', config=config)
    print(f'{t:<40} {r.archetype} ({r.confidence:.2f})')
"

# TS side (same fixtures)
cd apps/web && npx vitest run tests/scoring/classify-archetype.test.ts
```

### 4. Offline dashboard (30s)
```bash
python scripts/dashboard.py --view archetype
# 415 apps bucketed across 7 archetypes
```

### 5. Backfill dry-run (30s)
```bash
python scripts/backfill_archetypes.py --mode metadata --dry-run
# Expect: 415 scanned, 415 updated (dry-run, no writes)
```

### 6. Gap severity — live Sonnet call (2 min)
Requires an application with gaps in the DB and a running dev server:

```bash
cd apps/web && npm run dev
# In another terminal, with a real application ID:
curl -X POST http://localhost:3002/api/applications/<APP_ID>/gap-analysis \
  -H "Cookie: __session=<clerk_session_cookie>"
# Expect: every gap now has severity + mitigation + cited_achievements
# Watch spend in /dashboard/settings?tab=costs — $0.05 to $0.10 per eval
```

### 7. Insights distributions (1 min)
Navigate in browser:
```
http://localhost:3002/dashboard/insights
```
Three new cards appear: Grade Distribution, By Archetype, Weekly Trend.

### 8. Auto-pipeline (1 min)
```bash
curl -X POST http://localhost:3002/api/auto-pipeline \
  -H "Cookie: __session=<clerk_session_cookie>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://boards.greenhouse.io/anthropic/jobs/<jobid>"}'
# Expect: stages[] with {scrape, create, score} all ok:true, rolled_back:false
```

### 9. Extension autofill (1 min)
1. `chrome://extensions` → Reload extension
2. Navigate to a Greenhouse application form where you already have
   an evaluated application in the DB
3. Open popup → "Auto-Fill Application"
4. Watch identity fields fill AND the cover letter textarea populate
5. Verify the submit button is NOT clicked (never auto-submits)

### 10. Deep company research (1 min)
Invoke in Claude Code:
```
/skill company-research
```
Point at Anthropic or any recent application. Watch it run the 8-section
checklist. Output lands in `applications/<co>/company-brief.md`.

---

## Known follow-ups (not in this PR)

### Must-do before declaring done
- **Migration 021** must be applied to production
- **Backfill** must be run for existing apps to have archetype field populated
- **Extension v0.3.0** needs chrome://extensions reload

### Nice-to-have (tracked separately)
- Interactive Textual TUI (Phase 5 shipped stdlib-only; keyboard nav is follow-up)
- Web UI: archetype filter dropdown on `/dashboard/jobs`
- Web UI: gap severity rendering on `/dashboard/tracker/[id]`
- Web UI: "Draft negotiation" button calling negotiation-coach skill
- Doctor in GitHub Actions (gate PRs on green doctor)
- Auto-pipeline + tailor-resume + cover-letter e2e test (expensive, full.spec.ts tier)

### Deferred consciously
- Interview probability prediction (career-ops has it; we punted)
- Language detection EN/ES (you're English-only)
- Region detection US Letter/A4 (you're US-only)
- tmux conductor sessions (only useful with `batch_score --workers N` at high volume)

---

## Memory updates recommended

After merge, add to `memory/MEMORY.md`:
- `reference_archetype_classifier.md` — 7 archetypes + strictness knob
- `reference_portal_scanner.md` — 11 seeded companies, scan-history.tsv ledger
- `project_career_ops_port.md` — this REQ + which slices shipped

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Migration 021 breaks RLS on applications/pipeline_leads | Low | Pure ALTER TABLE ADD COLUMN; no policy changes; CHECK is additive |
| Backfill script mutates 415 files | Medium | `--dry-run` default in all invocations; forced `--force` for overwrite |
| Gap severity Sonnet cost grows | Medium | `createTrackedMessage` enforces $10/mo cap; opt-in per-application call |
| Auto-pipeline rollback races | Low | Rollback is a single DELETE; no foreign-key cycles |
| Extension cover letter fill on wrong URL | Low | match-url normalizes + same-user scoped; worst case: user pastes cover letter into wrong form and sees it before submit |
| scan-history.tsv grows unbounded | Low | Append-only but dedup on append; 680 URLs = ~50KB |

---

## Contact

Questions: jimmy. Built by Claude (sonnet-4.7) across two sessions of ~3 hours each.
Review timebox: 60 minutes expected.
