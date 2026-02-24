---
name: application-analytics
description: >
  Analyze job application outcomes and identify what's working. Use this skill whenever
  the user asks "how's my search going?", "what's working?", "show me patterns",
  "why am I not getting interviews?", "which sources are converting?", "give me analytics",
  "pipeline health", "conversion rates", or any question about the effectiveness of their
  job search strategy. Also trigger when the user asks to compare application outcomes,
  wants to understand which resume tailoring approach works best, or needs data to decide
  where to focus next. This is the intelligence layer — it turns raw application metadata
  into actionable insights. Do NOT trigger for individual status updates (job-tracker) or
  strategic recommendations (search-optimizer). This skill provides the data; search-optimizer
  interprets it.
recommended_model:
  default: sonnet
  reasoning: >
    Pattern matching across structured data, calculating conversion rates, and
    summarizing trends. No creative writing needed — just analytical clarity.
  upgrade_to_opus_when: >
    The user asks for deep strategic interpretation of the data (e.g., "what does this
    mean for my career?"). In that case, suggest invoking search-optimizer instead.
---

# Application Analytics — What's Working?

Turn raw application metadata into insights. This skill scans all application folders,
calculates conversion metrics, identifies patterns, and surfaces actionable findings.

## Why this skill exists

Without analytics, job searching is guesswork. You don't know if LinkedIn or referrals
convert better for your profile. You don't know if stretch matches ever work or if you
should focus on strong matches. You don't know that your follow-ups are 5 days late on
average. This skill makes the invisible visible.

## Prerequisites

- `job-applications/applications/` with at least 3-4 application folders containing
  `metadata.json` files
- Applications at various stages (evaluating, applied, interviewing, rejected) provide
  the most useful data. A pipeline with only "evaluating" applications has nothing to analyze.

## Workflow

### Step 1: Scan all applications

Read every `metadata.json` in `job-applications/applications/*/`. Build a dataset:

```
For each application, extract:
  - company, role
  - status (current stage in lifecycle)
  - match_score.overall (strong/good/stretch/long_shot)
  - source (LinkedIn, referral, direct, etc.)
  - applied_date, follow_up_date
  - tailoring_intensity (if set)
  - rejection_reason (if rejected)
  - interview_date (if interviewed)
  - learning_flags (if any)
  - former_employer flag
```

### Step 2: Calculate pipeline metrics

**Pipeline health:**
- Total applications by status (evaluating, applied, interviewing, offered, rejected, withdrawn)
- Velocity: average days from evaluating → applied → interviewing
- Stall detection: applications sitting in "applied" for 3+ weeks without movement

**Conversion rates (when enough data exists):**
- Applied → Interview rate (overall)
- Applied → Interview rate by match score
- Applied → Interview rate by source
- Applied → Interview rate by tailoring intensity
- Interview → Offer rate

**Source analysis:**
- Applications per source
- Conversion rate per source
- Average time-to-response per source

**Match score effectiveness:**
- Distribution of applications by match score
- Outcomes by match score (which scores lead to interviews?)
- Gap patterns: which gaps appear in rejections vs successes?

### Step 3: Identify patterns and at-risk items

**At-risk applications:**
- Follow-up dates that have passed with no status change
- Applications in "applied" for 14+ days with no movement
- Applications in "interviewing" with no follow-up date set

**Rejection patterns:**
- Common rejection reasons (if logged)
- learning_flags that repeat across applications
- Match score of rejected applications (are stretch matches always failing?)

**Positive patterns:**
- What do successful applications (interviewing+) have in common?
- Which keywords appear in applications that move forward?
- Which sources produce the most interviews?

### Step 4: Present findings

Structure the report in order of actionability:

1. **Pipeline snapshot** — Where things stand right now (counts by status)
2. **Urgent items** — Overdue follow-ups, stalled applications
3. **What's working** — Sources, match scores, or approaches with highest conversion
4. **What's not working** — Patterns in rejections or non-responses
5. **Recommendations** — 2-3 specific actions based on the data

Keep the report concise. Lead with numbers, not opinions. If there isn't enough data
for a reliable pattern (fewer than 5 applications in a category), say so — don't
extrapolate from 2 data points.

### Step 5: Save the report

Write the analytics report to `job-applications/analytics-report.md` (overwriting
any previous report). This file is consumed by search-optimizer.

## Minimum viable analytics

With only 3-4 applications, the skill can still provide:
- Pipeline snapshot
- Overdue follow-ups
- Time-in-stage for each application
- Basic match score distribution

As the dataset grows (10+ applications), conversion rates and source analysis
become meaningful. At 20+, pattern detection is reliable.

## Edge cases

- **No applications yet** — Explain that analytics need data to work. Suggest
  starting with job-intake.
- **All applications in "evaluating"** — Show pipeline snapshot, note that
  analytics will be more useful once applications are submitted.
- **Only rejections** — This is the most important case. Focus on rejection
  patterns and what to change.
- **Single source** — Can't compare sources. Note this and suggest diversifying.

## Skill composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| job-tracker (provides data) | **application-analytics** (finds patterns) | search-optimizer (makes recommendations) |

Read `references/analytics-metrics.md` for metric definitions and calculation details.
