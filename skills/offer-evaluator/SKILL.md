---
name: offer-evaluator
description: >
  Evaluate job offers and support negotiation. Use this skill when the user says "I got
  an offer", "received an offer from X", "they made me an offer", "evaluate this offer",
  "should I accept?", "is this a good offer?", "help me negotiate", "counter-offer",
  "they offered $X", "comparing two offers", or any discussion about accepting, declining,
  or negotiating a specific job offer. Also trigger when the user asks about salary ranges,
  equity evaluation, or how to respond to an offer. This is the final skill in the chain —
  turning interviews into outcomes. Do NOT trigger for general compensation research
  without a specific offer, or for interview prep (interview-prep-builder).
recommended_model:
  default: sonnet
  reasoning: >
    Single-offer evaluation and formatting is straightforward structured work that
    Sonnet handles well. Most users want a clear breakdown of comp, benefits, and
    a quick gut check — Sonnet delivers this fast without hanging.
  upgrade_to_opus_when: >
    The user is comparing multiple competing offers, needs negotiation strategy,
    or is weighing complex trade-offs (e.g., startup equity vs big-company stability,
    relocation considerations, career trajectory implications). Opus handles
    multi-factor reasoning and strategic advice better.
---

# Offer Evaluator — Maximize Your Outcome

## Intent

1. **Career goals outweigh salary** — a higher-paying role that derails the candidate's trajectory is a worse outcome than a lower-paying role that accelerates it
2. **Decision ownership belongs to the candidate** — the skill provides analysis, frameworks, and data; it never tells the candidate what to do; "here are the trade-offs" is the ceiling of advisory authority
3. **Long-term trajectory over short-term compensation** — equity vesting, promotion cycles, scope expansion, and learning opportunities compound in ways a signing bonus does not
4. **Negotiation ethics** — negotiation scripts are honest and professional; never bluff about competing offers that do not exist; never misrepresent current compensation
5. **Informed decisions replace anxiety** — the goal is a structured framework that transforms "should I accept?" from a feelings question into a data question
6. **Extract full value from every offer** — most candidates leave money on the table; identifying leverage points and drafting counter-proposals is part of the service
7. **Offer capture in 5-10 minutes; full analysis in 15-20 minutes; 5-6 factor scorecard** — thorough enough to support the decision, fast enough to meet exploding-offer deadlines

## Why this skill exists

Getting an offer is the goal — but accepting the wrong offer, or accepting without
negotiating, leaves value on the table. This skill ensures you make an informed
decision and negotiate from a position of knowledge.

## Prerequisites

- An application with `metadata.json` (ideally with interview history)
- Offer details from the user (salary, title, equity, benefits, etc.)
- `master/narrative.md` for understanding career goals

## Workflow

### Step 1: Capture the offer details

Get the full offer from the user. Ask about anything missing:

**Must know:**
- Base salary
- Title and level
- Start date
- Location / remote policy

**Should know:**
- Equity / stock (type, amount, vesting schedule)
- Signing bonus
- Annual bonus (target %)
- Benefits highlights (health, 401k match, PTO)
- Reporting structure (who do you report to?)

**Nice to know:**
- Relocation assistance
- Professional development budget
- Review/promotion cycle
- Team size and scope

### Step 2: Update metadata.json

Set:
- `status` → "offered"
- `offer.salary` → base salary
- `offer.equity` → equity description
- `offer.signing_bonus` → if offered
- `offer.remote` → fully/hybrid/on-site
- `offer.benefits_notes` → highlights
- `offer.decision_deadline` → when they need an answer

### Step 3: Evaluate the offer

**Compensation assessment:**
- Is the salary within the range posted in the job description?
- How does it compare to the user's current/previous compensation?
- Total compensation calculation (base + bonus + equity annual value)

**Role fit assessment:**
Based on narrative.md and the interview process:
- Does the role align with career trajectory goals?
- Is the scope appropriate for the seniority level?
- How does the team/reporting structure support growth?

**Practical assessment:**
- Location/remote alignment with preferences
- Benefits comparison with current situation
- Start date feasibility

**Risk assessment:**
- Company stability (public vs startup, funding stage)
- Team/leadership stability (did the CTO just leave?)
- Scope clarity (is the role well-defined or ambiguous?)

### Step 4: Identify negotiation leverage

**You have leverage when:**
- Your interview feedback was strong (from debrief notes)
- You have other active applications or offers
- The role has been open for a long time
- You bring a rare skill combination
- They reached out to you (vs you applied cold)

**Negotiate on these dimensions:**
- Base salary (most common, always worth trying)
- Signing bonus (easier for companies than raising base)
- Equity/stock (especially at pre-IPO companies)
- Title/level (costs them nothing, affects your future)
- Start date (more time = smoother transition)
- Remote policy (if hybrid, can you get more remote days?)
- Review timeline (accelerated first review at 6 months instead of 12)

**Don't negotiate on:**
- Benefits (usually company-wide, not flexible)
- PTO (often standardized)
- Things that make you seem difficult before day 1

### Step 5: Create the analysis document

Write `offer-analysis.md` in the application folder:

```markdown
# Offer Analysis — [Company] [Role]

**Received:** [date]
**Decision deadline:** [date]

## Offer Summary

| Component | Details |
|-----------|---------|
| Base salary | $X |
| Bonus target | X% |
| Equity | [description] |
| Signing bonus | $X |
| Total Year 1 | $X (estimated) |
| Location | [details] |
| Start date | [date] |

## Assessment

### Compensation
[Analysis against market and posted range]

### Role Fit
[Analysis against career goals from narrative.md]

### Growth Potential
[Assessment of trajectory from this role]

### Risks
[Any concerns identified]

## Negotiation Recommendations

### Leverage points
- [What you can push on]

### Suggested ask
- [Specific counter-proposal with numbers]

### Script
"Thank you for the offer. I'm excited about the role and [specific thing].
I'd like to discuss [specific ask]. Based on [rationale], I was hoping
we could [specific number/term]."

## Decision Framework

| Factor | Weight | Score (1-5) | Notes |
|--------|--------|-------------|-------|
| Compensation | | | |
| Role scope | | | |
| Growth potential | | | |
| Team/culture | | | |
| Location/remote | | | |
| Company stability | | | |
| **Weighted total** | | | |

## Recommendation
[Clear recommendation with reasoning]
```

### Step 6: If user wants to negotiate

Draft a negotiation email:

```markdown
# Negotiation Email — [Company]

Subject: Re: [Role] Offer — Excited to Discuss Details

[Name],

Thank you for extending the offer for the [Role] position. I'm genuinely
excited about [specific aspect of role/company that resonated in interviews].

After reviewing the details, I'd like to discuss [specific element]. Given
[rationale — market data, competing interest, specific value you bring], I
was hoping we could explore [specific ask].

[If relevant: I'm also considering another opportunity, and [Company] is my
strong preference because of [genuine reason]. I want to make sure we can
find alignment on compensation.]

I'm flexible on how we get there — whether that's [base/bonus/equity/signing
bonus]. My goal is a package that reflects the impact I expect to have in
this role.

Looking forward to discussing this. I'm available [times] this week.

Best,
[Name]
```

### Step 7: If comparing multiple offers

Create a side-by-side comparison:

```markdown
# Offer Comparison

| Factor | [Company A] | [Company B] |
|--------|------------|------------|
| Base | $X | $Y |
| Total comp | $X | $Y |
| Title | | |
| Scope | | |
| Remote | | |
| Growth | | |
| Culture fit | | |
```

## Edge cases

- **Verbal offer, no written** — Advise the user to get it in writing before
  making decisions. Help them draft a "thank you, looking forward to the written
  offer" email.
- **Lowball offer** — Be honest but strategic. If the offer is significantly below
  market, say so clearly and recommend a specific counter.
- **Exploding offer** — If the deadline is unreasonably short (< 3 days), help the
  user ask for more time. Most companies will accommodate.
- **Offer from former employer** — Note the dynamic. They know your work, which is
  leverage, but they also know your previous salary.

## Skill composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| interview-debrief (context) | **offer-evaluator** (maximizes outcome) | job-tracker (logs final decision) |
| application-analytics (market context) | | search-optimizer (outcome data) |

Read `references/evaluation-framework.md` for the decision scorecard methodology.
