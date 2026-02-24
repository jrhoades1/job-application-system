---
name: interview-debrief
description: >
  Capture learning from interviews. Use this skill whenever the user says "I just had
  an interview", "finished talking to them", "interview went well/badly", "debrief",
  "let me tell you what happened in the interview", "they asked about X", "the
  interviewer seemed interested in Y", or any post-interview reflection. Also trigger
  when the user wants to log interview notes, capture what resonated, track what questions
  were asked, or understand what signals to watch for. This skill turns a conversation
  about an interview into structured learning that improves future applications and
  interview prep. Do NOT trigger for pre-interview preparation (interview-prep-builder)
  or status updates without interview details (job-tracker).
recommended_model:
  default: opus
  reasoning: >
    Extracting meaningful signals from conversational interview accounts requires
    nuanced reasoning. The user will describe their interview informally — Opus
    can parse subtext, identify what's strategically important, and connect signals
    to the broader job search.
  downgrade_to_sonnet_when: >
    The user provides a pre-structured debrief (e.g., bullet points of what happened).
    Sonnet handles structured-to-structured just fine.
---

# Interview Debrief — Turn Interviews into Learning

After an interview, capture what happened in a way that helps future applications.
What did they care about? What resonated? What gap did they probe? This skill
converts informal reflections into structured intelligence.

## Why this skill exists

Most people walk out of an interview and forget the details within 48 hours. This
skill captures those details immediately and connects them to the broader job search.
When the third company asks about Terraform, that's a market signal — not a
coincidence.

## Prerequisites

- An application folder with `metadata.json` (the user has already gone through
  job-intake for this role)
- The user just had an interview and is ready to talk about it

If the user mentions an interview for a company that doesn't have an application
folder, create a minimal folder first (offer to run job-intake).

## Workflow

### Step 1: Identify the application

Which company and role? Check context — if the user just updated a status to
"interviewing" or mentioned a specific company, use that. If ambiguous, ask.

### Step 2: Guide the debrief conversation

Ask the user about their interview. Don't fire all questions at once — have a
conversation. Start with the open-ended question and follow up based on their
answers.

**Opening:** "How did it go? Tell me what happened."

Then explore these areas based on what they share:

**Who:**
- Who interviewed you? Name, title, role on the team
- Was it a recruiter screen, hiring manager, panel, technical?

**What they cared about:**
- What did they spend the most time on?
- What questions did they ask that surprised you?
- Did they probe any specific gap or concern?
- What seemed to get their energy or attention?

**What resonated:**
- Which of your experiences or achievements got the strongest response?
- Did they reference anything specific from your resume or cover letter?
- Were there "aha" moments?

**Pain points and priorities:**
- What problem are they trying to solve with this hire?
- Did they mention team challenges, technical debt, growth plans?
- What's their timeline?

**Culture and signals:**
- How did the conversation feel? Formal? Casual? Rushed?
- Did they sell the role to you? (Positive signal — they're interested)
- Any red flags? (Disorganized, vague about role, high turnover mentions)

**Next steps:**
- What did they say about next steps?
- Timeline for decision?
- More interviews planned?

### Step 3: Create interview-notes.md

Write structured notes in the application folder:

```markdown
# Interview Notes — [Company] [Role]

**Date:** YYYY-MM-DD
**Round:** [1st / 2nd / Final]
**Type:** [Phone / Video / In-person / Panel]
**Interviewer(s):** [Name — Title]

## What They Cared About
- [Topic 1] — [detail]
- [Topic 2] — [detail]

## What Resonated (Yours)
- [Achievement or experience that got a positive response]

## Their Pain Points
- [What they're trying to solve]

## Surprising Questions
- [Question you didn't expect]

## Culture Signals
- [Observation about energy, formality, interest level]

## Red Flags
- [If any — "None observed" is fine]

## Next Steps
- [What they said about timeline and process]

## Learning Flags
- [Insights for future applications — e.g., "Terraform is high-priority for platform roles"]
```

### Step 4: Update metadata.json

Set or update:
- `interview_date` — date of the interview
- `interview_round` — which round (1, 2, 3, etc.)
- `interview_type` — phone/video/in-person/panel
- `interview_notes_file` — "interview-notes.md"
- `status` → "interviewing" (if not already)
- `follow_up_date` — day after their stated timeline, or 1 week out if unclear
- `contact` — interviewer name if new

### Step 5: Feed the learning loop

Scan the interview notes for patterns:

**Cross-interview patterns:**
Check all other `interview-notes.md` files across applications. If the same skill
or topic appears in 3+ interviews, flag it:
- "This is the 3rd interview where Kubernetes came up prominently. It's becoming a
  pattern worth emphasizing in your resume and prep."

**Achievements discovery:**
If the user mentioned an accomplishment during the interview that's not in
`master/achievements.md`, offer to add it with a `[learned: YYYY-MM-DD]` tag.

**Gap signals:**
If the interviewer probed a gap from the original match_score, note whether the
bridge worked. Update `learning_flags` in metadata.json:
- "Bridge for 'no Terraform experience' worked — they accepted the IaC parallel"
- "Bridge for 'no streaming infra' did NOT land — they pushed back"

### Step 6: Confirm and summarize

Give the user a brief summary:
- "Logged debrief for HealthFirst VP Engineering. Key takeaway: they care most about
  AI/ML integration and team scaling. Your ilumed beneficiary expansion story landed
  well. Follow-up set for March 12."

If patterns were detected, mention them:
- "By the way, this is the third interview where they asked about cloud migration
  strategy. That's worth moving higher on your talking points."

## Edge cases

- **Multiple interviews same day** — Handle each separately. Ask which one first.
- **User doesn't remember details** — Capture what they have. Even "it went well,
  they seemed interested" is useful signal for status tracking.
- **Panel interview** — Log each interviewer's focus area separately if the user
  can distinguish them.
- **Interview for company not in system** — Offer to create a minimal folder via
  job-intake first, then proceed with debrief.

## Skill composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| interview-prep-builder (prepared for it) | **interview-debrief** (captures learning) | application-analytics (pattern data) |
| | | search-optimizer (strategic signals) |
| | | achievements.md (learning loop) |

Read `references/debrief-template.md` for the full question framework.
