---
name: search-optimizer
description: >
  Recommend job search strategy adjustments based on application data. Use this skill
  when the user asks "what should I apply to next?", "where should I focus?", "how
  should I adjust my search?", "what types of roles are working?", "should I keep
  doing stretch applications?", "am I wasting time on LinkedIn?", "what's my best
  approach?", or any strategic question about job search direction. Also trigger for
  weekly check-ins, after a batch of rejections, or when the user seems discouraged
  and needs data-driven guidance. This skill interprets analytics data and makes
  specific recommendations — it doesn't just show numbers (that's application-analytics).
  Do NOT trigger for individual application evaluation (job-intake) or status updates
  (job-tracker).
recommended_model:
  default: opus
  reasoning: >
    Strategic career reasoning requires weighing multiple factors: market signals,
    personal strengths, conversion data, and career trajectory. Opus handles the
    nuanced trade-offs between "apply to more stretch roles" vs "focus on strong
    matches" based on real data.
  downgrade_to_sonnet_when: >
    The user wants a simple recommendation like "which source to use" without
    deeper strategic analysis.
---

# Search Optimizer — Data-Driven Strategy

Recommend where to focus your job search based on what's actually working. This
skill consumes analytics data, interview debriefs, and rejection patterns to
produce specific, actionable strategy adjustments.

## Why this skill exists

Without strategy, job searching is random. You apply everywhere, burn out, and
wonder why nothing's working. This skill looks at your data and says: "Your
referrals convert 3x better than LinkedIn. Your strong matches convert 70%. You've
been rejected from 3 stretch roles for the same reason. Here's what to change."

## Prerequisites

- `job-applications/analytics-report.md` — Run application-analytics first if
  this doesn't exist (or data is stale)
- At least 5+ applications with outcomes for meaningful recommendations
- `master/narrative.md` — For understanding the user's positioning and goals

With fewer than 5 applications, provide directional guidance based on available
data rather than definitive strategy.

## Workflow

### Step 1: Load the data

Read:
- `analytics-report.md` (or scan metadata.json files if report is stale/missing)
- `master/narrative.md` for the user's career themes and targets
- All `interview-notes.md` files for market signals
- All `learning_flags` across metadata.json files

### Step 2: Assess current strategy

**Source effectiveness:**
- Which sources are producing interviews?
- Which sources have the best time-to-response?
- Is the user over-invested in a low-converting source?

**Match score strategy:**
- What's the conversion rate by match score?
- Are stretch applications ever working, or just burning time?
- Are strong matches converting reliably?

**Role type fit:**
- Which role titles and seniority levels are converting?
- Is the user's positioning (from narrative.md) aligned with what's working?
- Are certain industries or company sizes working better?

**Timing and velocity:**
- How many applications per week?
- Is the user applying fast enough to maintain pipeline?
- Is there a sweet spot for follow-up timing?

### Step 3: Identify strategic adjustments

Based on the data, develop 3-5 specific recommendations:

**Source reallocation:**
```
If referral conversion > 2x LinkedIn conversion:
  → "Shift 60% of effort to building referral pipeline"
  → Specific actions: reach out to X, Y, Z contacts from achievements.md companies
```

**Match score focus:**
```
If strong matches convert > 50% and stretch matches convert < 10%:
  → "Focus on strong and good matches. Stretch applications only if the company
     is a top-5 target worth the investment."
If stretch matches are converting:
  → "Your positioning is working for stretch roles. Keep the mix."
```

**Positioning adjustments:**
```
If 3+ rejections cite the same reason:
  → "Your resume is hiding [X]. Move it above the fold."
If interview debriefs show recurring topic:
  → "Market is asking for [X]. Make it prominent in your summary."
```

**Pipeline health:**
```
If fewer than 3 applications in "applied" or "interviewing":
  → "Pipeline is thin. Target 2-3 new applications this week."
If more than 10 applications with no interviews:
  → "Something fundamental needs to change. Consider: resume restructure,
     different role targets, or different sources."
```

### Step 4: Produce the strategy document

Write `job-applications/search-strategy.md`:

```markdown
# Search Strategy — [Date]

## Current Position
[1-2 sentences summarizing where the search stands]

## What's Working
- [Data-backed observation]
- [Data-backed observation]

## What's Not Working
- [Data-backed observation with specific evidence]

## Recommendations

### 1. [Primary recommendation]
**Why:** [Evidence from data]
**Action:** [Specific next step]

### 2. [Secondary recommendation]
**Why:** [Evidence from data]
**Action:** [Specific next step]

### 3. [Third recommendation]
**Why:** [Evidence from data]
**Action:** [Specific next step]

## Target Profile for Next Applications
- **Role types:** [specific titles that work]
- **Company types:** [industry, size, stage]
- **Sources to prioritize:** [ranked by conversion]
- **Match score filter:** [minimum viable match]
- **Keywords to emphasize:** [from interview patterns]
```

### Step 5: Present and discuss

Share the strategy with the user. Be direct but empathetic — job searching is
stressful. Frame recommendations as optimization, not criticism.

If the data contradicts the user's instincts, explain why with specific numbers.
"I know LinkedIn feels productive because you're active there daily, but 0 of your
6 LinkedIn applications have led to interviews. Your 2 referral applications both
led to interviews."

## Edge cases

- **User has strong preferences** — Respect stated constraints ("I only want
  remote" or "I won't go below Director level"). Optimize within those bounds.
- **Not enough data** — Be honest. "With 4 applications, I can see early signals
  but not reliable patterns. Here's what the early data suggests..."
- **Everything is working** — Great! Recommend maintaining the approach and
  increasing volume.
- **Nothing is working** — The hardest case. Look for the root cause: wrong role
  level, wrong industry, resume not showcasing key skills, or market timing.

## Skill composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| application-analytics (data) | **search-optimizer** (strategy) | job-intake (informed by strategy) |
| interview-debrief (signals) | | resume-tailor (adjusted approach) |
| application-outcome-logger (patterns) | | |

Read `references/optimization-patterns.md` for strategy frameworks.
