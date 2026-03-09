# LinkedIn Optimization Guide — Jimmy Rhoades

> Comprehensive playbook for fixing LinkedIn job recommendations.
> Generated 2026-03-09. Reference this when making changes to your LinkedIn profile.

---

## Table of Contents

1. [Why Your Emails Are Wrong](#why-your-emails-are-wrong)
2. [Immediate Fixes (Do Today)](#immediate-fixes-do-today)
3. [Profile Optimization (This Week)](#profile-optimization-this-week)
4. [Alert Configuration](#alert-configuration)
5. [Behavioral Training (2-Week Plan)](#behavioral-training-2-week-plan)
6. [Advanced: Content & Engagement Strategy](#advanced-content--engagement-strategy)
7. [Advanced: Recruiter Visibility](#advanced-recruiter-visibility)
8. [Monitoring & Measurement](#monitoring--measurement)
9. [What NOT to Do](#what-not-to-do)

---

## Why Your Emails Are Wrong

Three root causes, in order of likelihood:

### 1. Job alerts are too broad
Alerts are frozen snapshots of the search query you saved. If you didn't set the experience level filter to "Director" + "Executive" at creation time, you're getting everything from team leads to ICs with "Director" in some random field.

### 2. LinkedIn is misclassifying your seniority
You can't set seniority manually — it's inferred from headline, current title, years of experience, and skills. If your profile doesn't scream Director/VP through semantic clustering, the algorithm downgrades you to "mid-senior level."

### 3. "Recommended Jobs" emails are separate from alert emails
Recommendation emails use profile inference only, not your alert filters. You might be getting both types and conflating them. They have different controls.

---

## Immediate Fixes (Do Today)

### A. Open to Work Settings
**Path:** `Me → View Profile → Open to → Finding a new job`

| Setting | Value |
|---------|-------|
| **Job titles (5)** | Director of Engineering, VP of Engineering, Head of Engineering, Director of Software Engineering, Engineering Director |
| **Locations** | Your target metros + "Remote" explicitly |
| **Job type** | Full-time only (add Contract only if genuinely open) |
| **Start date** | Immediately (or your actual availability) |
| **Visibility** | **Recruiters Only** — 3x more recruiter outreach, no desperation signal, hidden from current employer |

### B. Delete and Recreate All Job Alerts
Kill every existing alert. They're frozen with old filters. Create fresh ones (see [Alert Configuration](#alert-configuration) below).

### C. Settings & Privacy Toggles
**Path:** `Me → Settings & Privacy → Job seeking preferences`

Turn **ON** all four:
- [x] "Use your data to recommend jobs"
- [x] "Share resume data with hirers"
- [x] "Signal your interest to recruiters at companies you've created job alerts for"
- [x] "Share with job poster" when applying externally

### D. Separate Alert Emails from Recommendation Emails
**Path:** `Settings → Notifications → Email → Jobs`

| Email Type | Setting | Why |
|------------|---------|-----|
| Job alerts | **ON** (daily) | Your curated, filtered alerts |
| Job recommendations | **OFF** | Broad inference, uncontrollable, mostly noise |
| Career opportunities | ON | Recruiter InMail notifications |

---

## Profile Optimization (This Week)

### Headline (220 characters max)

**Formula:** `[Target Title] | [Domain] | [Differentiator with Number] | [Second Differentiator]`

**Your recommended headline:**
```
Director of Engineering | Healthcare AI/ML | Built & Scaled Teams 0→22 | FHIR/HL7 Integration at Scale
```

**Rules:**
- Target title must appear verbatim — it's the most heavily indexed field
- Include semantic neighbors: "Healthcare IT," "AI/ML," "Team Scaling"
- Use pipe separators, not commas
- No fluff: "passionate," "innovative," "driven" waste your 220 characters
- Use ALL 220 characters — more text = more keyword surface for the algorithm

### About Section (2,600 chars; first 275 critical)

**First 275 characters** are all that shows on mobile. This is your hook:

```
Engineering leader who builds teams from zero and ships at scale. 20+ years
scaling orgs (0→22 at MedQuest, 4→25 at ilumed), integrating AI/ML into
healthcare workflows, and connecting 18+ EHR systems via FHIR/HL7. Expanded
beneficiary coverage from 50K to 90K through
```

**Full About structure:**
1. **Quantified hook** (1-2 sentences) — biggest claim with numbers
2. **What you do** (2-3 sentences) — domain + technical keywords woven naturally
3. **Key differentiators** (3-4 bullets) — drawn from narrative.md
4. **What you're looking for** (1-2 sentences) — signals intent to recruiters and algorithm

**Key points:**
- First person (LinkedIn convention, not resume third-person)
- Every claim has a number: team sizes, revenue impact, system scale
- Target keywords distributed throughout, not keyword-stuffed
- Close with what you want — the algorithm reads this as intent signal

### Skills Section (up to 50; order matters)

Build **three semantic clusters.** LinkedIn's Knowledge Graph treats clustered skills as deep expertise; isolated skills as shallow.

**Cluster 1 — Leadership & Strategy (pin top 3):**
- Engineering Leadership ★
- Strategic Planning ★
- Organizational Design ★
- Cross-functional Collaboration
- Headcount Planning
- Executive Communication
- Team Building
- Talent Development
- Technical Strategy
- Budget Management

**Cluster 2 — Technical Depth:**
- System Architecture
- AI/ML Integration
- Cloud Infrastructure (AWS, Azure)
- Microservices Architecture
- Platform Engineering
- DevOps / CI/CD
- API Design
- Data Engineering
- Performance Optimization
- Distributed Systems

**Cluster 3 — Healthcare Domain:**
- Healthcare IT
- FHIR
- HL7
- EHR Integration
- HIPAA Compliance
- SOC 2 / HITRUST
- Value-Based Care
- Clinical Workflows
- Population Health Management
- Interoperability

**Remove these** (dilute Director-level seniority signal):
- Individual IC skills: HTML, CSS, jQuery, JavaScript (unless genuinely your technical edge)
- Generic: Microsoft Office, Communication Skills, Problem Solving
- Outdated: SVN, SOAP, anything you can't discuss in an interview

### Experience Section

For each role, ensure bullets follow **C-A-R format** (Challenge → Action → Result):

**Good:** "Built protocol-agnostic integration engine connecting 18+ healthcare systems via FHIR/HL7, enabling bi-directional data flow across Epic, Athena, and CMS"

**Bad:** "Responsible for system integrations and healthcare data management"

**Rules:**
- Title must contain "Director," "VP," "Head of," or "CTO" — drives seniority inference
- First bullet per role = strongest accomplishment
- Numbers in 60%+ of bullets (team size, percentages, dollar amounts, scale)
- Keywords from target job descriptions distributed across positions
- 3-5 bullets per recent role, 1-2 for older roles

### Featured Section

Add 2-3 items:
- A post or article about AI in healthcare (thought leadership signal)
- A project summary showing Director-level scope
- A recommendation quote from a C-suite peer

### Recommendations

Target:
- At least 3-5 visible recommendations
- At least 1 from a direct report (proves leadership)
- At least 1 from a C-suite peer or manager
- Recommendations should mention team building, strategy, technical vision — not just "great developer"

### Profile Photo & Banner

- Professional headshot (21x more profile views)
- Custom banner (not default LinkedIn blue) — healthcare/tech themed
- Customize URL: `linkedin.com/in/jimmy-rhoades`

---

## Alert Configuration

### Recommended Alerts (5 total)

#### Alert 1: Director of Engineering — Remote
```
Query:    "Director of Engineering" OR "Director, Engineering" OR
          "Director of Software Engineering" OR "Engineering Director"
Level:    Director, Executive
Location: United States (Remote)
Type:     Full-time
Freq:     Daily
```

#### Alert 2: VP / Head of Engineering — Remote
```
Query:    "VP of Engineering" OR "VP, Engineering" OR
          "Head of Engineering" OR "Vice President of Engineering"
Level:    Director, Executive
Location: United States (Remote)
Type:     Full-time
Freq:     Daily
```

#### Alert 3: Healthcare Engineering Leadership
```
Query:    ("Director" OR "VP" OR "Head of" OR "CTO") AND
          ("Engineering" OR "Technology") AND
          ("Healthcare" OR "Health" OR "Clinical" OR "Medical")
Level:    Director, Executive
Location: United States (Remote)
Type:     Full-time
Freq:     Daily
```

#### Alert 4: AI/ML Engineering Leadership
```
Query:    ("Director" OR "VP" OR "Head of") AND
          ("Engineering" OR "AI" OR "Machine Learning") AND
          ("AI" OR "ML" OR "Artificial Intelligence")
Level:    Director, Executive
Location: United States (Remote)
Type:     Full-time
Freq:     Daily
```

#### Alert 5: Dream Company Alerts
Create one alert per top-target company:
```
Query:    "Engineering" OR "Technology"
Level:    Director, Executive
Company:  [Company Name]
Freq:     Daily
```

### Alert Management Rules

1. **Delete all old alerts first** — they don't auto-update when you change your profile
2. **Max 5-7 alerts** — more creates overlap and email fatigue
3. **Review monthly** — recreate any alert that consistently delivers noise
4. **Always set experience level** — this is the #1 mistake people make

---

## Behavioral Training (2-Week Plan)

LinkedIn's algorithm learns from your behavior. After fixing your profile and alerts, actively retrain it.

### Week 1 — Reset the Signals

| Day | Action | Time |
|-----|--------|------|
| Mon | Save 5 Director-level postings you'd actually want | 10 min |
| Tue | Click "Not interested" (⋯ menu) on 10+ irrelevant recommendation cards | 10 min |
| Wed | Follow 5 target companies | 5 min |
| Thu | Search "Director of Engineering Remote" — browse results, save good ones | 10 min |
| Fri | Save 5 more target postings, dismiss 10 more irrelevant ones | 10 min |
| Sat | Search "VP of Engineering Healthcare" — browse and save | 10 min |
| Sun | Review: Are daily alert emails getting better? Note signal-to-noise ratio | 5 min |

### Week 2 — Reinforce and Measure

| Day | Action | Time |
|-----|--------|------|
| Mon | Save 3 target postings, dismiss 5 irrelevant recommendations | 10 min |
| Tue | Like/comment on 2 posts from target companies or industry leaders | 10 min |
| Wed | Search "Head of Engineering AI ML" — browse and save | 10 min |
| Thu | Dismiss 5 more irrelevant recommendation cards | 5 min |
| Fri | Engage with 1 post about healthcare technology | 5 min |
| Sat | Search your target title — do YOUR recommendations match now? | 10 min |
| Sun | **Measure:** Count relevant vs irrelevant in this week's alert emails | 10 min |

### Ongoing (After Week 2)

- **Daily:** 2 minutes dismissing irrelevant cards (maintenance)
- **Weekly:** 1 targeted search for your exact title
- **Monthly:** Review and refresh alerts; re-run the linkedin-optimizer skill for a signal-to-noise check

---

## Advanced: Content & Engagement Strategy

Content builds "topic authority" — a slow but powerful signal that shapes what LinkedIn shows you and who sees your profile.

### Easy Wins (No Original Content Required)

- **Comment thoughtfully** on 2-3 posts per week from engineering leaders in healthcare/AI
- **Repost with insight** — share an industry article with 2-3 sentences of your take
- **React to target company posts** — this signals interest and shows you in their orbit

### If You Want to Post (Higher Impact)

- **Frequency:** 1-2 posts per month (consistency > volume)
- **Topics that build Director-level authority:**
  - Team scaling lessons ("What I learned building a team from 0 to 22")
  - AI/ML in healthcare (real production challenges, not hype)
  - Engineering leadership patterns (architecture decisions, tech debt tradeoffs)
  - Healthcare interoperability war stories (FHIR/HL7, EHR integration)
- **Format:** Short posts (150-300 words) with a hook in the first line
- **Avoid:** Motivational platitudes, "I'm humbled to announce," engagement bait

### Connection Strategy

- **Connect with recruiters** at target companies (with a note mentioning your interest)
- **Connect with hiring managers** — VPs and CTOs at companies you'd want to work for
- **Accept recruiter connection requests** even if the role isn't right — you stay in their pipeline
- **Join 2-3 LinkedIn groups** in healthcare IT or engineering leadership (modest signal boost)

---

## Advanced: Recruiter Visibility

Beyond Open to Work, there are ways to increase how often recruiters find you:

### LinkedIn Recruiter Search Factors

Recruiters using LinkedIn Recruiter see candidates ranked by:
1. **Profile completeness** — every section filled = higher ranking
2. **Keyword match** to their search query
3. **Responsiveness** — if you reply to InMail, you rank higher for future recruiters
4. **Activity recency** — profiles active in last 30 days rank higher
5. **Open to Work signal** — Recruiters Only mode flags you in their search results

### Tactics

- **Reply to every InMail** even if the role isn't right — "Thanks for reaching out. I'm focused on Director+ engineering leadership roles in healthcare/AI. Happy to connect for future opportunities." This boosts your responsiveness score.
- **Update your profile at least monthly** — even a small edit (reorder skills, tweak a bullet) resets the "last active" signal
- **Keep your profile photo current** — outdated photos reduce trust and click-through
- **Complete every section** — LinkedIn's completeness score affects recruiter search ranking

---

## Monitoring & Measurement

### Signal-to-Noise Ratio

Each time you receive a LinkedIn job alert email, count:
- **Signal:** Jobs where title + seniority + domain match your targets
- **Noise:** Everything else

```
SNR = Signal / (Signal + Noise)
```

| SNR | Assessment |
|-----|-----------|
| < 30% | Profile/alerts need significant work |
| 30-50% | Getting better, continue tuning |
| 50-70% | Good — alerts are well-configured |
| > 70% | Excellent — maintain current setup |

### Track Over Time

Use the linkedin-optimizer skill's digest scorer (Mode 3) to log SNR over time:
```
Week 1: 2/15 relevant (13%) — baseline before changes
Week 2: 5/12 relevant (42%) — after alert reconfiguration
Week 3: 8/10 relevant (80%) — after profile + behavioral training
```

### Re-Audit Triggers

Re-run the full linkedin-optimizer audit when:
- SNR drops below 50% for 2+ consecutive weeks
- You change target role type or industry focus
- You add significant new experience/achievements
- LinkedIn makes major algorithm changes (watch their blog)

---

## What NOT to Do

| Don't | Why |
|-------|-----|
| Click into every job notification out of curiosity | Each click = positive signal for that role type |
| Apply to "Easy Apply" roles below your level | Strongest training signal — floods you with similar roles |
| Search for roles you'd never take | Trains recommendations toward those roles |
| Use the public green "Open to Work" badge | Desperation signal at Director level; current employer sees it |
| Create 15+ overlapping alerts | Overlap = duplicate emails, not better coverage |
| Leave old alerts running after profile changes | Alerts don't auto-update — they use old filters |
| Add every skill you've ever used | Dilutes seniority signal; keep it focused on Director-level |
| Post engagement-bait content | "Agree?" posts hurt credibility with hiring managers |
| Ignore recruiter InMails | Hurts your responsiveness score in LinkedIn Recruiter |
| Keyword-stuff your headline | Algorithm detects this; use natural language with strategic terms |

---

## Quick Reference: Settings Locations

| What | Where |
|------|-------|
| Open to Work | Me → View Profile → Open to → Finding a new job |
| Job preferences | Settings & Privacy → Job seeking preferences |
| Email notifications | Settings & Privacy → Notifications → Email → Jobs |
| Job alerts | Jobs tab → My Jobs → Job alerts |
| Skills section | Profile → Skills → pencil icon |
| Featured section | Profile → Featured → + button |
| Profile URL | Profile → Edit public profile & URL (right sidebar) |
| Visibility | Settings & Privacy → Visibility |

---

*This guide was generated by the linkedin-optimizer skill. Re-run the skill periodically to update recommendations based on new application data and market signals.*
