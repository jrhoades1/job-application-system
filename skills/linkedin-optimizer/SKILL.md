---
name: linkedin-optimizer
description: >
  Audit LinkedIn profile alignment, generate optimized alert configurations, and
  track recommendation quality over time. Use this skill when the user says "my
  LinkedIn suggestions suck," "optimize my LinkedIn," "fix my job alerts," "what
  should my headline say," "am I showing up for the right roles," "audit my
  LinkedIn profile," "LinkedIn keywords," or any question about improving LinkedIn
  visibility and job match quality. Also trigger when the user forwards a LinkedIn
  job email digest for quality scoring. Do NOT trigger for general job search
  strategy (search-optimizer) or individual application evaluation (job-intake).
---

# LinkedIn Optimizer — Profile Audit, Alert Tuning, and Match Monitoring

## Intent

1. **LinkedIn is an input channel, not a strategy** — this skill optimizes the signal quality of one source; career strategy lives in search-optimizer
2. **Profile is the lever, alerts are the filter** — most "bad recommendation" problems are profile problems, not alert problems
3. **Measurable improvement** — track signal-to-noise ratio before and after changes so we know what worked
4. **Manual execution, automated analysis** — LinkedIn doesn't allow API-based profile edits; this skill generates the exact text/config to paste, then tracks results
5. **Keyword alignment is a scoring problem** — reuse the same pattern-matching logic from job-intake to compare profile text against target role requirements

## Why this skill exists

LinkedIn's recommendation engine is a black box that infers your seniority, domain,
and interests from profile text, skills, behavioral signals, and explicit preferences.
When the inference is wrong, you get irrelevant job emails. This skill audits your
profile against what the algorithm needs, generates precise alert configurations, and
monitors whether changes improved match quality.

## Prerequisites

- `master/achievements.md` — Source of truth for accomplishments and keywords
- `master/narrative.md` — Positioning and tone guide
- `packages/scoring-rules/scoring-rules.yaml` — For scoring LinkedIn digest jobs
- At least 3-5 target role examples (from high-scoring applications in `applications/`)

## Workflow

### Mode 1: Profile Audit

**Trigger:** "audit my LinkedIn," "optimize my profile," "what should my headline say"

#### Step 1: Load profile baseline

Read:
- `master/achievements.md` — all quantified accomplishments
- `master/narrative.md` — positioning themes and differentiators
- Top 5 highest-scoring applications (sort `applications/*/metadata.json` by match score)
- `references/profile-audit-checklist.md` — the audit framework

#### Step 2: Extract keyword universe

From the top-scoring applications, extract:
- **Required skills** that matched as "strong" — these are your proven keywords
- **Job titles** from those postings — these are your target title variants
- **Industry terms** that appear in 3+ postings — domain signal words
- **Leadership terms** from responsibility sections — seniority signal words

Cross-reference against `master/achievements.md` to confirm each keyword has backing evidence.

#### Step 3: Generate profile recommendations

For each LinkedIn profile section, generate specific text:

**Headline (220 chars max):**
- Format: `[Target Title] | [Domain] | [2-3 Differentiators with Numbers]`
- Pull from narrative.md differentiators and achievements.md top metrics
- Include semantic neighbors of the target title (see `references/algorithm-signals.md`)

**About Section (2,600 chars max, first 275 visible on mobile):**
- First 275 chars = quantified hook with target title and top 3 metrics
- Body = narrative.md themes expanded with specific numbers from achievements.md
- Close with what you're looking for (signals intent to the algorithm)

**Skills Section (50 max, order matters):**
- Generate 3 semantic clusters from `references/algorithm-signals.md`:
  - Leadership cluster (8-10 skills)
  - Technical cluster (8-10 skills)
  - Domain cluster (8-10 skills)
- Pin top 3 skills (most endorsed/relevant) to be visible on profile

**Experience Bullets:**
- For each role, ensure C-A-R format (Challenge-Action-Result)
- Front-load keywords from the keyword universe
- Include metrics from achievements.md for each role

**Featured Section:**
- Recommend 2-3 items: a post about AI in healthcare, a project summary, a recommendation quote

#### Step 4: Output the audit report

Write `linkedin-audit-{date}.md` to the working directory:

```markdown
# LinkedIn Profile Audit — {date}

## Keyword Gap Analysis
| Keyword | In Achievements? | In Top Matches? | On LinkedIn? | Action |
|---------|------------------|-----------------|--------------|--------|
| ...     | Yes/No           | 3/5 postings    | Yes/No       | Add/OK |

## Recommended Headline
> [exact text to paste, ≤220 chars]

## Recommended About (First 275 chars)
> [exact text to paste]

## About Section (Full)
[full 2,600-char text]

## Skills to Add
### Leadership Cluster
- [skill 1], [skill 2], ...
### Technical Cluster
- [skill 1], [skill 2], ...
### Domain Cluster
- [skill 1], [skill 2], ...

## Skills to Remove
- [irrelevant skills that dilute signal]

## Experience Section Edits
### [Company] — [Title]
**Current:** [summary of what's there or "unknown — check manually"]
**Recommended bullets:**
- [C-A-R bullet with keywords]
- ...

## Featured Section
- [recommended items]

## Open to Work Settings
- **Job titles (5):** [exact titles to enter]
- **Locations:** [locations + Remote]
- **Visibility:** Recruiters Only
```

### Mode 2: Alert Generator

**Trigger:** "fix my alerts," "what alerts should I set up," "my email suggestions are bad"

#### Step 1: Analyze target roles

From top-scoring applications and narrative.md, identify:
- Target title variants (Director of Engineering, VP Engineering, Head of Engineering, etc.)
- Target industries
- Location preferences
- Remote/hybrid/onsite preference
- Company size preferences

#### Step 2: Generate alert configurations

For each alert, specify:
- **Search query** (with boolean operators): `("Director" OR "VP" OR "Head of") AND ("Engineering" OR "Software")`
- **Experience level filter:** Director, Executive
- **Job type:** Full-time
- **Location:** [specific or Remote]
- **Frequency:** Daily

Generate 3-5 focused alerts rather than 1 broad one:

```markdown
# Recommended LinkedIn Job Alerts

## Alert 1: Director of Engineering — Remote
- **Query:** `("Director of Engineering" OR "Director, Engineering" OR "Director of Software Engineering")`
- **Experience:** Director, Executive
- **Location:** Remote
- **Type:** Full-time
- **Frequency:** Daily

## Alert 2: VP / Head of Engineering — Remote
- **Query:** `("VP of Engineering" OR "Head of Engineering" OR "VP, Engineering")`
- **Experience:** Director, Executive
- **Location:** Remote
- **Type:** Full-time
- **Frequency:** Daily

## Alert 3: Healthcare Engineering Leadership
- **Query:** `("Engineering" OR "Technology") AND ("Healthcare" OR "Health" OR "Clinical")`
- **Experience:** Director, Executive
- **Location:** Remote
- **Type:** Full-time
- **Frequency:** Daily
```

Also output the email settings to change:
- Disable "Job recommendations" emails (these use broad inference)
- Keep only "Job alerts" emails (your curated alerts)
- Enable all 4 job-seeking preference toggles

### Mode 3: Digest Scorer

**Trigger:** User pastes or describes jobs from a LinkedIn email digest

#### Step 1: Parse the digest

Extract each job from the pasted content:
- Title, company, location, key requirements (if visible)

#### Step 2: Score each job

Use the same scoring logic as job-intake against `master/achievements.md`:
- Strong match / Good match / Stretch / Long shot
- Flag any that are clearly wrong seniority level

#### Step 3: Calculate signal-to-noise ratio

```
Signal-to-Noise = (Strong + Good matches) / Total jobs in digest
```

Track over time in `linkedin-signal-log.json`:
```json
{
  "entries": [
    {"date": "2026-03-09", "total": 15, "strong": 1, "good": 3, "stretch": 4, "long_shot": 7, "snr": 0.27},
    {"date": "2026-03-16", "total": 12, "strong": 3, "good": 5, "stretch": 3, "long_shot": 1, "snr": 0.67}
  ]
}
```

#### Step 4: Report and recommend

```markdown
## LinkedIn Digest Score — {date}

**Signal-to-Noise:** 27% (4 relevant / 15 total)
**Trend:** [improving/declining/stable] vs last check

### Relevant Jobs
| # | Title | Company | Score | Action |
|---|-------|---------|-------|--------|
| 1 | Dir of Eng | Acme Health | Strong | → Run job-intake |
| 2 | Head of Eng | Beta Corp | Good | → Run job-intake |

### Irrelevant Jobs (Why They Appeared)
| # | Title | Company | Issue |
|---|-------|---------|-------|
| 3 | Sr Engineer | Gamma | Wrong seniority — profile may need title keywords |
| 7 | PM Lead | Delta | Wrong function — remove "Product" from skills |

### Recommendations
- [specific profile/alert changes based on the noise pattern]
```

### Mode 4: Keyword Optimizer

**Trigger:** "what keywords am I missing," "why am I not showing up for the right roles"

#### Step 1: Load all strong-match applications

Read all `applications/*/metadata.json` where match_score indicates strong or good match.

#### Step 2: Extract winning keywords

From those job descriptions, extract:
- Skills mentioned in 3+ postings
- Title variants used
- Industry-specific terms
- Leadership/scope descriptors

#### Step 3: Compare against profile

Cross-reference winning keywords against:
- Current achievements.md entries
- Recommended LinkedIn skills (from last audit)
- Headline and About section recommendations

#### Step 4: Output keyword gap report

```markdown
## Keyword Optimization Report — {date}

### High-Value Keywords Missing from LinkedIn
| Keyword | Appears In | Evidence in Achievements? | Priority |
|---------|-----------|--------------------------|----------|
| FHIR    | 4/5 matches | Yes — ilumed integration | HIGH     |
| ...     | ...       | ...                      | ...      |

### Keywords on LinkedIn That Dilute Signal
| Keyword | Relevance to Target Roles | Recommendation |
|---------|--------------------------|----------------|
| jQuery  | 0/5 matches              | Remove         |
| ...     | ...                      | ...            |
```

## Edge Cases

- **No LinkedIn access** — Skill generates all text/config offline; user applies manually
- **User hasn't applied to enough roles** — Use narrative.md and achievements.md as primary source; note that recommendations will improve with more application data
- **User wants to optimize for a different role type** — Ask which titles to target before running the audit
- **Multiple career tracks** — Generate separate headline/about variants for each track; user chooses which to activate

## Skill Composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| master/achievements.md (keywords) | **Profile audit** | LinkedIn profile (manual edits) |
| master/narrative.md (positioning) | **Alert generator** | LinkedIn alert config (manual) |
| scoring-rules.yaml (scoring) | **Digest scorer** | search-optimizer (channel quality) |
| applications/*/metadata.json (patterns) | **Keyword optimizer** | resume-tailor (keyword sync) |
| | | job-intake (from digest leads) |

Read `references/profile-audit-checklist.md` for the full audit framework.
Read `references/alert-templates.md` for boolean search patterns.
Read `references/algorithm-signals.md` for LinkedIn algorithm behavior.
