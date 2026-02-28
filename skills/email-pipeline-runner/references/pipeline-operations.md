# Pipeline Operations Reference

## Gmail Setup Guide

### 1. Create a dedicated Gmail account
- Create a new Gmail account (e.g., `yourname.jobevals@gmail.com`)
- This keeps job pipeline emails separate from personal email

### 2. Enable 2-Step Verification
- Go to Google Account > Security > 2-Step Verification
- Enable it (required for app passwords)

### 3. Generate an App Password
- Go to Google Account > Security > 2-Step Verification > App passwords
- Select "Mail" and "Windows Computer"
- Copy the 16-character password
- Set environment variable: `export JOB_PIPELINE_GMAIL_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx'`

### 4. Create Gmail Labels
The pipeline uses labels to track email processing state. Create these labels in Gmail:
- `pipeline/processed` — emails that have been successfully fetched and saved
- `pipeline/failed` — emails that caused errors during processing
- `pipeline/not-job` — emails classified as non-job content

### 5. Set Up Forwarding
On your phone/tablet email app, forward interesting job emails to the dedicated address.

## Script Execution Order

Scripts must run in sequence — each depends on the previous step's output:

```
email_fetch.py   → pipeline/staging/raw/*.json
email_parse.py   → pipeline/staging/parsed/*.json
career_search.py → pipeline/staging/sourced/*.json
job_score.py     → pipeline/review_queue.json + application folders
```

## CLI Arguments

### email_fetch.py
```
--limit N     Max emails to fetch (default: 50)
--dry-run     Show what would be fetched without saving
```

### email_parse.py
```
--reparse     Re-parse already processed emails
```

### career_search.py
```
--limit N            Max leads to process
--retry-unresolved   Retry previously unresolved leads
```

### job_score.py
```
--rescore     Re-score already scored leads
```

## Error Codes and Remediation

| Error | Script | Cause | Fix |
|-------|--------|-------|-----|
| IMAP login failed | email_fetch | Bad credentials | Check email address and app password |
| No emails in INBOX | email_fetch | Nothing forwarded | Forward some job emails first |
| Google search 429 | career_search | Rate limited | Increase throttle_seconds, wait 5 min |
| Playwright not found | career_search | Not installed | `pip install playwright && playwright install chromium` |
| Career page timeout | career_search | Site unreachable | Marked as unresolved; retry later |
| No achievements.md | job_score | Missing file | Ensure master/achievements.md exists |
| openpyxl not found | job_score | Not installed | `pip install openpyxl` |

## Extending ATS Handlers

To add a new ATS system, add an entry to `pipeline_config.json`:

```json
"ats_handlers": {
    "new_ats_name": {
        "url_patterns": ["ats-domain.com"],
        "requires_playwright": true
    }
}
```

Then add a `scrape_new_ats_name()` function in `career_search.py` and add it to the routing in `scrape_job_description()`.

## Adding New Sender Templates

To handle a new email source, add to `pipeline_config.json`:

```json
"sender_templates": {
    "newsource.com": {
        "type": "job_board",
        "subject_patterns": ["regex patterns with named groups"],
        "multi_job_indicator": "regex for multi-job detection",
        "body_parse_strategy": "generic"
    }
}
```

Supported body_parse_strategy values: `linkedin_cards`, `indeed_list`, `glassdoor_cards`, `ziprecruiter_list`, `dice_list`, `recruiter_heuristic`, `generic`.
