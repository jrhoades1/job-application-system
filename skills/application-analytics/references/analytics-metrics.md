# Analytics Metrics Reference

## Metric Definitions

### Pipeline Health Metrics

**Application count by status** — Simple count of applications in each lifecycle stage.
Healthy pipeline should have applications moving through stages, not piling up in
"evaluating" or "applied."

**Average days in stage** — For each status, how long applications typically sit there.
Calculate from folder creation date (in folder name) or applied_date.

```
days_in_applied = today - applied_date (for applications still in "applied")
days_to_interview = interview_date - applied_date (for applications that moved to "interviewing")
```

**Stall threshold:** An application is "stalled" if:
- Status is "applied" and (today - applied_date) > 21 days
- Status is "interviewing" and no follow_up_date is set
- Follow_up_date has passed by 7+ days with no status change

### Conversion Metrics

**Applied → Interview rate:**
```
interview_rate = count(status in [interviewing, offered]) / count(status in [applied, interviewing, offered, rejected])
```
Exclude "evaluating" and "ready_to_apply" — they haven't entered the funnel yet.

**Interview → Offer rate:**
```
offer_rate = count(status == offered) / count(status in [interviewing, offered, rejected where rejection_date > interview_date])
```

**Source conversion rate:**
```
For each source:
  interviews_from_source = count(source == X and status in [interviewing, offered])
  applications_from_source = count(source == X and status in [applied, interviewing, offered, rejected])
  rate = interviews_from_source / applications_from_source
```

**Match score conversion:**
```
For each match_score.overall value:
  interviews_with_score = count(overall == X and status in [interviewing, offered])
  applications_with_score = count(overall == X and status in [applied, interviewing, offered, rejected])
  rate = interviews_with_score / applications_with_score
```

### Pattern Detection

**Rejection reason frequency:**
```
For each unique rejection_reason:
  count occurrences
  If count >= 3: flag as "recurring pattern"
```

**Keyword correlation:**
```
For applications that got interviews:
  collect all keywords from match_score.keywords
  count frequency of each keyword

For applications that got rejected:
  collect all keywords
  count frequency

Compare: keywords that appear more in successful applications than rejected ones
are "winning keywords"
```

**Gap analysis:**
```
For applications that got interviews despite gaps:
  which addressable_gaps were present?
  these are "successfully bridged gaps"

For applications rejected:
  which hard_gaps were present?
  these are "deal-breaker gaps"
```

## Report Template

```markdown
# Job Search Analytics — [Date]

## Pipeline Snapshot
- **Evaluating:** X applications
- **Ready to Apply:** X applications
- **Applied:** X applications (avg X days in stage)
- **Interviewing:** X applications
- **Offered:** X
- **Rejected:** X
- **Withdrawn:** X

## Urgent Items
- [Company — Role] follow-up overdue by X days
- [Company — Role] stalled in "applied" for X days

## Conversion Rates
- Overall applied → interview: X% (N/M)
- By source: [table]
- By match score: [table]

## Patterns
- [Pattern description with evidence]

## Recommendations
1. [Specific action based on data]
2. [Specific action based on data]
3. [Specific action based on data]
```

## Small Sample Caveats

When calculating rates with fewer than 5 applications in a category, preface with
"Limited data:" and avoid stating percentages. Instead use language like "1 of 2
referral applications led to an interview" rather than "50% referral conversion rate."

At 10+ applications in a category, percentages are reasonable.
At 20+, trends and comparisons are meaningful.
