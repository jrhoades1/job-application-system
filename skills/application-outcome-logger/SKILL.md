---
name: application-outcome-logger
description: >
  Track rejections, closures, and outcomes with learning. Use this skill when the user
  says "got a rejection", "they passed", "didn't get it", "no response after follow-up",
  "application closed", "they went with someone else", "internal hire", or any indication
  that an application ended without an offer. Also trigger for "I'm withdrawing from X",
  "pulling my application", or "decided not to continue with Y". This skill doesn't just
  update status — it captures WHY the application ended and detects patterns across
  rejections that can improve future applications. Do NOT trigger for positive outcomes
  like interviews (interview-debrief) or offers (offer-evaluator). For simple status
  updates without rejection context, job-tracker may be sufficient, but this skill adds
  the learning layer.
recommended_model:
  default: haiku
  reasoning: >
    Primary operation is reading a reason, updating metadata.json, and checking for
    patterns. Mechanical work that Haiku handles well.
  upgrade_to_sonnet_when: >
    The user provides detailed rejection feedback that needs interpretation, or
    pattern detection triggers a strategic recommendation.
---

# Application Outcome Logger — Learn from Every No

## Intent

1. **Never guess at rejection reasons** — if the candidate does not know why, log "no_reason_given"; fabricating explanations creates false patterns that poison strategy
2. **Pattern threshold is 3, not 1** — a single rejection is noise; two is a coincidence; three with the same reason is a signal worth acting on
3. **Respectful framing of outcomes** — rejections are data, not verdicts; the language in summaries and pattern reports reflects that the candidate is a person, not a pipeline metric
4. **User context matters** — "overqualified" from a startup means something different than from an enterprise; category alone is insufficient without context notes
5. **Learning accumulation** — every logged outcome enriches the dataset that analytics and search-optimizer consume; even "no_reason_given" carries signal about which channels ghost
6. **Signal detection feeds strategy change** — the purpose of logging is not record-keeping; it is detecting the point where individual rejections become a pattern that demands adjustment
7. **Outcome capture under 1 minute; pattern detection triggers at 3+ matching rejections** — logging should be frictionless so it actually happens after every outcome

## Why this skill exists

Most people treat rejections as dead ends. This skill treats them as data. When you
log why applications failed, patterns emerge: "They keep saying I lack Kubernetes
experience" or "All my LinkedIn cold applies fail." That data feeds search-optimizer
and changes the strategy.

## Prerequisites

- An application folder with `metadata.json`
- The user knows the outcome (rejection, withdrawal, or closure)

## Workflow

### Step 1: Identify the application

Which company and role? Check recent context. If the user just said "got a rejection"
without specifying, check for applications in "applied" or "interviewing" status and
ask which one.

### Step 2: Capture the reason

Ask: "Do you know why? Any feedback from them?"

Common reasons to categorize:

| User says | Categorize as |
|-----------|--------------|
| "They went with someone else" | other_candidate_selected |
| "Internal hire" / "filled internally" | internal_hire |
| "Overqualified" | overqualified |
| "Looking for someone with more X" | skill_gap: [specific skill] |
| "Salary too high" / "budget" | compensation_mismatch |
| "No response after follow-up" | no_response |
| "Position was eliminated" / "hiring freeze" | position_closed |
| "Not enough experience in their industry" | industry_mismatch |
| No feedback given | no_reason_given |
| User is withdrawing | withdrawn: [user's reason] |

### Step 3: Update metadata.json

Set:
- `status` → "rejected" (or "withdrawn" if user-initiated)
- `rejection_date` → today (YYYY-MM-DD)
- `rejection_reason` → categorized reason from above
- `rejection_insights` → any additional context worth remembering
- Add to `learning_flags` if the rejection carries a signal

### Step 4: Check for patterns

Scan all other metadata.json files for matching rejection patterns:

```
Count applications where:
  rejection_reason contains same skill_gap
  OR rejection_reason matches same category
```

**Pattern thresholds:**
- 2 rejections, same reason → "Note: This is the second time [reason]. Worth watching."
- 3+ rejections, same reason → "Pattern detected: [reason] has come up [N] times.
  This needs a strategy adjustment."
  - If skill_gap: "Your resume may not be showcasing [skill] prominently enough,
    or it might be a genuine gap to address."
  - If compensation_mismatch: "Consider adjusting salary expectations or targeting
    different company tiers."
  - If no_response: "Cold applications aren't working. Consider shifting to warmer
    channels (referrals, recruiter relationships)."

### Step 5: Sync to tracker

Update tracker.xlsx with the new status (same pattern as job-tracker).

### Step 6: Confirm and advise

"Logged rejection from [Company] — [Role]. Reason: [category]."

If pattern detected:
"This is the [Nth] rejection citing [reason]. I recommend running search-optimizer
to review your strategy."

If no pattern:
"No recurring pattern yet. This data will help analytics identify trends over time."

## Edge cases

- **Ghosted** — If the user says "never heard back," categorize as no_response.
  Set rejection_date to today. Suggest it might still be active if fewer than 30
  days have passed.
- **Soft rejection** — "We'll keep your resume on file" = rejection. Log it.
- **Deferred** — "Not now but maybe later" = log as rejected with note. Can
  re-apply later as a new application.
- **Multiple rejections at once** — Process each one individually. Summarize
  patterns at the end.

## Skill composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| job-tracker (status data) | **application-outcome-logger** (captures why) | application-analytics (pattern data) |
| | | search-optimizer (if pattern triggers) |
