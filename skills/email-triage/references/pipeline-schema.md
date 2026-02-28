# Pipeline Schema Reference

## Staging Directory Structure

```
pipeline/
  staging/
    raw/                     # Raw email JSON from email_fetch.py
      {uid}.json             # One file per email UID
    parsed/                  # Parsed leads from email_parse.py
      {uid}.json             # Array of leads extracted from that email
    sourced/                 # Scraped descriptions from career_search.py
      {uid}_{index}.json     # One file per lead (uid + lead index)
  review_queue.json          # Ranked output for this skill
  review_queue.md            # Human-readable summary
  fingerprints.json          # Email dedup index (fingerprint -> uid)
  processed/                 # Archive of completed batch summaries
    {date}_{batch_id}.json
```

## review_queue.json Format

```json
{
  "batch_id": "2026-02-26_a3f8c2",
  "generated_at": "2026-02-26T14:30:00.000000",
  "leads": [
    {
      "rank": 1,
      "company": "HealthFirst Technologies",
      "role": "VP of Engineering",
      "score": {
        "overall": "strong",
        "match_percentage": 87.5,
        "strong_count": 7,
        "partial_count": 2,
        "gap_count": 0
      },
      "top_matches": ["team building (0→22)", "HIPAA compliance", "microservices"],
      "top_gaps": [],
      "source_platform": "LinkedIn",
      "email_uid": "12345",
      "email_date": "Thu, 26 Feb 2026 10:30:00 -0500",
      "career_page_url": "https://healthfirst.com/careers/vp-engineering",
      "application_folder": "2026-02-26_healthfirst-technologies_vp-of-engineering",
      "employment_type": "full_time",
      "location": "Remote (US)",
      "remote_status": "remote",
      "compensation": "$200K-$280K",
      "confidence": 0.85,
      "red_flags": [],
      "dedup_note": "",
      "status": "pending_review"
    }
  ],
  "auto_skipped": [
    {
      "company": "TempStaff Inc",
      "role": "Contract Python Dev",
      "reason": "Employment type: contract (auto-skip rule)",
      "score": "stretch",
      "email_uid": "12347"
    }
  ],
  "unresolved": [
    {
      "company": "Unknown Startup",
      "role": "Engineering Director",
      "reason": "Company career page not found",
      "email_uid": "12346"
    }
  ]
}
```

## Pipeline metadata.json Fields

In addition to the standard metadata.json fields, pipeline-sourced applications include:

| Field | Type | Description |
|-------|------|-------------|
| `email_uid` | string\|null | IMAP UID of the source email |
| `pipeline_batch` | string\|null | Batch ID from the pipeline run |
| `pipeline_confidence` | number\|null | 0.0-1.0 confidence in company/role extraction |
| `employment_type` | string\|null | full_time, contract, part_time, temp |
| `skip_date` | string\|null | YYYY-MM-DD when user skipped this lead |
| `skip_reason` | string\|null | Why the user chose to skip |

## Pipeline Status Values

| Status | Meaning | Set by |
|--------|---------|--------|
| `ingested` | Email parsed, company/role extracted | email_parse.py |
| `sourced` | Job description found on company career site | career_search.py |
| `pending_review` | Scored and ranked, awaiting user | job_score.py |
| `skipped` | User reviewed and chose not to pursue | email-triage skill |
| `unresolved` | Automation couldn't complete a step | any script |
