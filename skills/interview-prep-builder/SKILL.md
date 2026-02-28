---
name: interview-prep-builder
description: >
  Prepare for upcoming interviews with role-specific talking points. Use this skill
  when the user says "I have an interview", "prep me for my interview", "interview
  tomorrow", "interview on Friday", "help me prepare for [company]", "what should I
  expect?", "what questions will they ask?", "practice interview", or any request
  to get ready for a specific upcoming interview. Also trigger when the user mentions
  a scheduled interview and seems nervous or wants to review key points. This skill
  generates a custom prep document based on the specific role, the user's match score,
  past interview patterns, and known gaps. Do NOT trigger for post-interview reflection
  (interview-debrief) or general job search strategy (search-optimizer).
recommended_model:
  default: sonnet
  reasoning: >
    Generating structured prep materials from metadata, job descriptions, and past
    interview patterns is well-suited for Sonnet. The questions and talking points
    follow predictable patterns enhanced by specific data.
  upgrade_to_opus_when: >
    The user wants to practice with mock interview questions and needs nuanced
    follow-up probing, or wants help with difficult gap-bridging narratives.
---

# Interview Prep Builder — Walk In Ready

## Intent

1. **Talking points must trace to real achievements** — every story, number, and claim must exist in achievements.md or base-resume.docx; preparing the candidate to say something they cannot substantiate is sabotage
2. **Gap bridges must be genuine** — "my AWS work translates to GCP" is honest positioning; "I've been learning GCP on my own" without evidence is fabrication
3. **Customized per company and role** — generic interview prep is available everywhere; the value is connecting THIS candidate's specific achievements to THIS role's specific requirements
4. **Practice over perfection** — the prep doc is a study guide, not a script; the candidate should internalize talking points, not memorize paragraphs
5. **Confidence from preparation** — knowing your best stories and how they connect to the role reduces anxiety and improves performance
6. **Learning loop from past interviews** — previous debrief patterns inform question prediction; prep improves with every interview in the system
7. **Prep document in 15-20 minutes; 3 talking points minimum; 10-15 likely questions** — comprehensive enough to be useful, concise enough to actually be reviewed before the interview

## Why this skill exists

Going into an interview unprepared means relying on improvisation for the most
important conversations in your job search. This skill does the homework: which
achievements to highlight, how to bridge your gaps, what questions they'll likely
ask based on the role type, and what to ask them.

## Prerequisites

- Application folder with `metadata.json` and `job-description.md`
- `master/achievements.md` for pulling specific accomplishments
- Optional but valuable: previous `interview-notes.md` files from other applications
  (for pattern-based question prediction)

## Workflow

### Step 1: Identify the interview

Which company, role, and when? Check context. If the user just got scheduled,
they'll mention it. Confirm the details and check that the application folder
exists.

### Step 2: Load context

Read:
- `metadata.json` — match score, gaps, keywords, tailoring intensity
- `job-description.md` — the full role requirements
- `master/achievements.md` — your accomplishment inventory
- `master/narrative.md` — your positioning themes for this role type
- Previous `interview-notes.md` files (if any) — for question patterns

### Step 3: Generate the prep document

Create `interview-prep.md` in the application folder:

```markdown
# Interview Prep — [Company] [Role]

**Interview date:** [date]
**Interview type:** [phone/video/in-person/panel]
**Interviewer(s):** [if known]

## Your Top 3 Talking Points

Based on this role's requirements and your strongest matches:

### 1. [Strength area]
**The story:** [Specific achievement from achievements.md]
**Numbers:** [Quantified impact]
**Connection to role:** [How this maps to their requirement]

### 2. [Strength area]
**The story:** [Specific achievement]
**Numbers:** [Quantified impact]
**Connection to role:** [How this maps]

### 3. [Strength area]
**The story:** [Specific achievement]
**Numbers:** [Quantified impact]
**Connection to role:** [How this maps]

## Gap Bridges

For each addressable gap from the match score:

### [Gap: specific skill/experience]
**Bridge approach:** [How to position adjacent experience]
**Example:** "While I haven't worked specifically with [X], my work on [Y]
at [Company] involved similar [principles/challenges/patterns]..."
**Evidence:** [Specific accomplishment that partially addresses the gap]

## Likely Questions

Based on the role type and past interview patterns:

### Behavioral
- "Tell me about a time you scaled a team from scratch."
  → Use: [specific MedQuest or Red Spot story]
- "Describe a technical decision you made that had significant business impact."
  → Use: [specific achievement]

### Technical
- [Role-specific technical questions based on job description]

### Strategic
- "How would you approach [key challenge from job description]?"
  → Framework: [suggested approach]

### Curveball (from past interviews)
- [Questions that came up in similar role interviews]

## Questions to Ask Them

Show you've done homework and are evaluating them too:

1. "What's the biggest technical challenge the team is facing right now?"
2. "How does this role interact with [specific team/function from job description]?"
3. "What does success look like in the first 90 days?"
4. "What's the team's approach to [specific methodology from job description]?"

## Numbers Cheat Sheet

Quick-reference for your key metrics (from achievements.md):

| Metric | Number | Context |
|--------|--------|---------|
| [Achievement 1] | [Number] | [Company, Year] |
| [Achievement 2] | [Number] | [Company, Year] |
| [Achievement 3] | [Number] | [Company, Year] |

## Pre-Interview Checklist

- [ ] Review the job description one more time
- [ ] Check the company's recent news (last 30 days)
- [ ] Confirm interview logistics (link, time zone, who you're meeting)
- [ ] Have your talking points fresh in mind
- [ ] Prepare 3-4 questions for them
- [ ] Have a copy of your tailored resume handy
```

### Step 4: Customize for interview round

**Recruiter screen (Round 1):**
- Focus on: fit, salary alignment, high-level background
- Keep stories short (1-2 minutes each)
- Emphasize enthusiasm for the role

**Hiring manager (Round 2):**
- Focus on: leadership, strategic thinking, team building
- Share detailed stories with numbers
- Ask about their vision and challenges

**Technical panel (Round 3+):**
- Focus on: architecture decisions, technical trade-offs
- Be ready for whiteboard or system design
- Show depth in their specific tech stack

**Final round / executive:**
- Focus on: business impact, cultural fit, long-term vision
- Ask about company strategy and growth
- Show alignment with company mission

### Step 5: Incorporate past interview learning

If previous `interview-notes.md` files exist:
- Pull recurring questions from similar roles
- Note which stories/approaches worked well
- Highlight gap bridges that succeeded or failed
- Flag: "In your HealthFirst interview, they asked about HITRUST specifically.
  Similar roles may ask about compliance frameworks — have your answer ready."

### Step 6: Present the prep

Share the document. Ask if there are specific areas the user wants to drill
deeper on. Offer to do mock Q&A for the gap bridge sections.

## Edge cases

- **No interview date set** — Create the prep anyway. Better to be ready early.
- **No past interviews** — Generate questions from the job description and role
  type alone. Flag that predictions will improve after debriefs.
- **Second interview at same company** — Reference the first interview debrief.
  Focus on what they're likely to probe deeper.
- **Panel with unknown members** — Prepare for multiple perspectives: technical,
  managerial, product. Cover all angles.

## Skill composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| job-intake (match score, gaps) | **interview-prep-builder** (preparation) | interview-debrief (captures what happened) |
| interview-debrief (past patterns) | | |

Read `references/common-questions.md` for question frameworks by role type.
