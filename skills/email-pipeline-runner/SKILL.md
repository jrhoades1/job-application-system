---
name: email-pipeline-runner
description: >
  Run and monitor the email-to-job pipeline scripts. Use this skill when the user
  says "run the email pipeline," "fetch my emails," "check for new job emails,"
  "process emails," "run the pipeline," "update the pipeline," or any request to
  execute the email-to-job automation scripts. Also trigger when the user asks
  "pipeline status," "how many emails are pending," or "what's stuck in the pipeline."
  This skill orchestrates the four Python scripts (email_fetch, email_parse,
  career_search, job_score) and reports results. Do NOT trigger for reviewing
  ranked leads (that's email-triage) or for evaluating a specific job (job-intake).
recommended_model:
  default: haiku
  reasoning: >
    This skill runs shell commands and reports status. No reasoning or creative
    output needed. Haiku is sufficient for orchestration and error reporting.
  upgrade_to_sonnet_when: >
    A pipeline step fails and the user needs help diagnosing the error or when
    the user asks strategic questions about pipeline configuration.
---

# Email Pipeline Runner — Fetch, Parse, Search, and Score

## Intent

1. **Pipeline execution is idempotent** — running the pipeline twice on the same data produces the same outcome; no duplicate processing, no data loss, no duplicate application folders
2. **Partial failures are isolated** — one email that fails to parse does not block the rest of the batch; one career page that is unreachable does not prevent other leads from being scored
3. **Transparency over magic** — always tell the user what each script did, how many items were processed, and what failed; never silently swallow errors
4. **Configuration is checked before execution** — if `pipeline_config.json` is missing or has invalid credentials, fail immediately with a clear message rather than running partial steps
5. **Execution completes in under 2 minutes for a batch of 10 emails** — career_search.py is the bottleneck due to HTTP throttling; set expectations accordingly

## Why this skill exists

Forwarding job emails from your phone is the easy part. Turning those emails into scored, ranked leads requires running four scripts in sequence with proper error handling. This skill wraps that orchestration so the user says "run the pipeline" and gets a clear summary of what happened.

## Prerequisites

This skill expects:
- `pipeline_config.json` at the project root with valid email credentials
- The `JOB_PIPELINE_GMAIL_APP_PASSWORD` environment variable set
- `pipeline/` directory structure created (staging/raw, staging/parsed, staging/sourced)
- Python packages installed: `beautifulsoup4`, `requests`, `thefuzz`, `playwright`, `openpyxl`

## Workflow

### Step 1: Validate configuration

Before running any script, check:
1. `pipeline_config.json` exists and has a valid email address (not `CHANGE_ME@gmail.com`)
2. The environment variable for the app password is set
3. The `pipeline/` directory structure exists

If any check fails, guide the user through setup:
- Missing config: "Copy pipeline_config.json and update the email address"
- Missing password: "Set the environment variable: export JOB_PIPELINE_GMAIL_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx'"
- Missing directories: Create them automatically

### Step 2: Run scripts in sequence

Execute each script and capture output:

```
1. python email_fetch.py    → "Fetched 7 new emails (3 LinkedIn, 2 Indeed, 1 recruiter, 1 unknown)"
2. python email_parse.py    → "Parsed 7 emails → 12 job leads (5 single, 2 multi-job with 7 leads)"
3. python career_search.py  → "Found career pages for 10/12 leads. 2 unresolved."
4. python job_score.py      → "Scored 10 leads: 2 strong, 3 good, 3 stretch, 2 long shot."
```

If any script exits with non-zero, stop and report the error. Do not continue past a failed script unless the user explicitly says to skip it.

### Step 3: Report summary

After all scripts complete:
```
Pipeline complete:
  Emails fetched:  7
  Leads extracted: 12
  Career pages:    10 found, 2 unresolved
  Scored:          10 (2 strong, 3 good, 3 stretch, 2 long shot)
  Auto-skipped:    0
  Ready for review: 10

Run email-triage to see your ranked results.
```

### Step 4: Handle errors

Common errors and remediation:
- **IMAP login failed**: Check email address and app password
- **Google search blocked**: Increase throttle_seconds in config, wait 5 minutes
- **Playwright not available**: Install with `playwright install chromium`
- **Career page timeout**: Will be marked as unresolved; retry with `--retry-unresolved`
- **No new emails**: Not an error — just report "No new emails to process"

### Pipeline Status (alternative workflow)

When the user asks "pipeline status" or "what's pending":
1. Count files in `pipeline/staging/raw/` (fetched)
2. Count files in `pipeline/staging/parsed/` (parsed)
3. Count files in `pipeline/staging/sourced/` (sourced)
4. Read `pipeline/review_queue.json` for leads pending review
5. Report counts by stage

## Skill composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| User forwards emails to Gmail | **email-pipeline-runner** (orchestrates scripts) | email-triage (user reviews ranked results) |

## Edge cases

- **First run**: Config may not exist. Guide through setup before running.
- **Empty inbox**: Not an error. Report "No new emails" and suggest forwarding some.
- **All leads unresolved**: Report which companies failed and why. Suggest manual URLs.
- **Partial batch from previous run**: Scripts are idempotent — re-running is safe.
- **Large batch (50+ emails)**: Warn about career search taking several minutes due to throttling.
