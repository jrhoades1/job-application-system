# Review Workflow Reference

## Presentation Format

Leads are presented grouped by score tier, strongest first:

```
## Strong (N)
[rank] Company — Role
       Score: Strong (XX% match) | Source: Platform
       Matches: top 3 requirement matches
       Gaps: top 2 gaps (if any)
       Location | Compensation | Flags

## Good (N)
...

## Stretch (N)
...

## Long Shot (N)
...
```

## Review Commands

### Individual commands
- `promote 1` — Promote lead #1 to full evaluation
- `skip 2` — Skip lead #2
- `tell me more about 3` — Show full job description for lead #3

### Batch commands
- `promote 1, 3, 5` — Promote multiple leads
- `skip 2, 4, 6` — Skip multiple leads
- `promote all strong` — Promote all leads in the strong tier
- `skip all long shots` — Skip all leads in the long shot tier
- `skip all` — Skip the entire batch

### Navigation commands
- `show unresolved` — Display leads where automation failed
- `show skipped` — List recently skipped leads (option to un-skip)
- `show auto-skipped` — List leads auto-skipped by config rules

## Promote Workflow

When a lead is promoted:
1. `metadata.json` status: `pending_review` → `evaluating`
2. `tracker.xlsx` status: "Pending Review" → "Evaluating"
3. `index.json` status updated
4. Offer to chain into job-intake: "Want to evaluate [Company — Role] now?"

## Skip Workflow

When a lead is skipped:
1. `metadata.json` status: `pending_review` → `skipped`
2. `metadata.json` sets `skip_date` to today (YYYY-MM-DD)
3. Optionally capture `skip_reason` from user
4. `tracker.xlsx` status: "Pending Review" → "Skipped"
5. `index.json` status updated
6. Lead removed from active review queue

## Unresolved Resolution

For unresolved items, offer these options:
- **Manual company correction**: User provides the real company name → re-run career search for that lead
- **Manual URL override**: User provides the job posting URL → scrape that URL directly
- **Dismiss**: Mark as skipped with reason "unresolved — dismissed"

## Stale Lead Handling

- Items pending review for 7+ days: warn that postings may be expired
- Items pending review for 14+ days: strongly suggest skipping or verifying
- User can override: "I know it's still open" keeps the item active

## Un-skip Workflow

When user says "show skipped" and wants to reconsider:
1. List recently skipped items (last 30 days)
2. User can say "un-skip 2" to revert status to `pending_review`
3. Lead re-enters the review queue
