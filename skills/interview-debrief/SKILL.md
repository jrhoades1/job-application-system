---
name: interview-debrief
description: >
  Capture learning from interviews. Use this skill whenever the user says "I just had
  an interview", "finished talking to them", "interview went well/badly", "debrief",
  "let me tell you what happened in the interview", "they asked about X", "the
  interviewer seemed interested in Y", or any post-interview reflection. Also trigger
  when the user provides a transcript file (.txt) from an interview, wants to log
  interview notes, capture what resonated, track what questions were asked, or
  understand what signals to watch for. This skill turns a conversation about an
  interview into structured learning that improves future applications and interview
  prep. Do NOT trigger for pre-interview preparation (interview-prep-builder) or
  status updates without interview details (job-tracker).
recommended_model:
  default: sonnet
  reasoning: >
    Most interview debriefs involve structured extraction — what questions were asked,
    what went well, what to improve. Sonnet handles this reliably and responds fast
    enough that the user doesn't lose momentum while the interview is fresh.
  upgrade_to_opus_when: >
    The user provides a long transcript (10+ pages) requiring speaker identification,
    nuanced signal interpretation, and achievement extraction. Also upgrade when the
    user gives unstructured accounts with subtle signals (e.g., "the interviewer seemed
    hesitant when I mentioned X"). Opus is better at reading between the lines and
    connecting signals to strategic implications.
---

# Interview Debrief — Turn Interviews into Learning

## Intent

1. **Conversational, not interrogative** — the debrief should feel like talking to a trusted advisor, not filling out a form; open-ended questions first, structured capture second
2. **A single interview signal is not a pattern** — one interviewer asking about Kubernetes is a data point; three interviewers asking is a market signal; never upgrade a single observation to a trend
3. **Empathy first, analysis second** — if the candidate is excited, share the excitement before structuring notes; if discouraged, acknowledge it before pivoting to learning
4. **Learning framing for every outcome** — even a bad interview produces usable intelligence about what the market cares about, which gap bridges work, and which stories land
5. **Pattern detection feeds strategy** — cross-interview signals are the most valuable output; they change how the candidate prepares and which roles to target
6. **Achievement discovery** — candidates mention accomplishments in conversation that never made it to achievements.md; capturing these expands the inventory for all future applications
7. **Tactical learnings compound** — every interview should make the next one better; extract what worked and what to improve into `master/interview-learnings.md`
8. **Debrief conversation 5-10 minutes; pattern flagging at 3+ signals; new achievements tagged with [learned] date** — capture while the interview is fresh, but never rush past the conversational layer

## Why this skill exists

Most people walk out of an interview and forget the details within 48 hours. This
skill captures those details immediately and connects them to the broader job search.
When the third company asks about Terraform, that's a market signal — not a
coincidence. When the candidate keeps stumbling on NoSQL scaling questions, that's a
gap to study — not bad luck.

## Prerequisites

- An application folder with `metadata.json` (the user has already gone through
  job-intake for this role)
- The user just had an interview and is ready to talk about it
- OR: The user has a transcript file (.txt) from an interview recording

If the user mentions an interview for a company that doesn't have an application
folder, create a minimal folder first (offer to run job-intake).

## Workflow

### Step 1: Identify the application

Which company and role? Check context — if the user just updated a status to
"interviewing" or mentioned a specific company, use that. If ambiguous, ask.

### Step 2: Debrief — Conversation OR Transcript Import

Two paths depending on what the user provides:

#### Path A: Conversational Debrief (user tells you what happened)

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

#### Path B: Transcript Import (user provides a .txt file)

When the user provides a transcript file path:

1. **Read the full transcript** — may require multiple reads for large files
2. **Identify speakers** — determine which speaker is the candidate and which is
   the interviewer(s). Look for context clues: the person describing their background
   is the candidate; the person asking questions and describing the company is the
   interviewer.
3. **Extract structured content:**
   - Interview flow and timing (segments, topics covered, duration estimates)
   - What the interviewer asked / probed on
   - What the candidate said that landed well (positive reactions, follow-up interest)
   - What the candidate stumbled on (redirects, topic changes, uncertain answers)
   - Intel gathered about the company, team, role, culture
   - Signals about next steps
4. **Generate the debrief analysis** — provide the user with your assessment:
   - Overall performance evaluation
   - What landed, what could be sharper
   - Key intel gathered
   - Signals for next steps (positive/negative/neutral)
5. **Proceed to Step 3** to create the structured debrief file

### Step 3: Create interview-debrief-rN.md

Write structured notes in the application folder. Name the file
`interview-debrief-rN.md` where N is the round number.

```markdown
# Interview Debrief — Round N: [Type]

**Date:** YYYY-MM-DD
**Duration:** [estimated or actual]
**Interviewer(s):** [Name, Title]
**Format:** [Video / Phone / In-person / Panel]

---

## Interview Flow

| Segment | Duration | Topic |
|---------|----------|-------|
| [Segment] | [~X min] | [Topic] |

---

## What They Cared About
- [Topic 1] — [detail]
- [Topic 2] — [detail]

## What Landed
- [Achievement or approach that got a positive response]

## What to Sharpen
- [Areas where the answer could have been stronger]

## Intel Gathered
- [Company/team/role information learned during the interview]

## Signals & Next Steps
- [What they said about next steps, timeline, process]
- [Assessment: positive/neutral/concerning signals]

## Learning Flags
- [Insights for future applications]
```

### Step 4: Update metadata.json

Update the `interviews[]` array in metadata.json. Add or update the entry for this round:

```json
{
  "round": N,
  "type": "recruiter_screen | hiring_manager | technical_panel | behavioral | system_design | final",
  "date": "YYYY-MM-DD",
  "interviewer": "Name, Title",
  "duration": "X min",
  "focus": "Topics covered",
  "notes_file": "interview-debrief-rN.md",
  "status": "completed",
  "outcome": "Brief assessment"
}
```

Also update legacy fields for backward compatibility:
- `interview_date` — date of the most recent interview
- `interview_round` — current round number
- `interview_type` — type of the most recent interview
- `interview_notes_file` — most recent debrief file
- `status` → "interviewing" (if not already)
- `follow_up_date` — day after their stated timeline, or 1 week out if unclear

### Step 5: Feed the learning loop

#### 5a: Cross-interview pattern detection (existing)

Check all other `interview-debrief-rN.md` and `interview-notes.md` files across
applications. If the same skill or topic appears in 3+ interviews, flag it:
- "This is the 3rd interview where Kubernetes came up prominently. It's becoming a
  pattern worth emphasizing in your resume and prep."

**Gap signals:**
If the interviewer probed a gap from the original match_score, note whether the
bridge worked. Update `learning_flags` in metadata.json:
- "Bridge for 'no Terraform experience' worked — they accepted the IaC parallel"
- "Bridge for 'no streaming infra' did NOT land — they pushed back"

#### 5b: Achievement extraction (NEW)

Scan the debrief (or transcript if available) for achievements the candidate
mentioned that aren't already in `master/achievements.md`:

1. **Parse what the candidate said** — focus on their statements, not the interviewer's
2. **Identify quantified achievements** — numbers, percentages, team sizes, timelines
3. **Identify technical specifics** — systems built, protocols used, architectures designed
4. **Identify leadership examples** — teams managed, processes instituted, decisions made
5. **Diff against `master/achievements.md`** — only flag items that are genuinely NEW
6. **Present candidates for user confirmation:**
   - "Found N new achievements from this interview. Add them?"
   - List each with the proposed category and text
7. **On confirmation, append to `master/achievements.md`** with `[learned: YYYY-MM-DD]` tag

**Why this matters:** Every interview makes the candidate articulate their experience
in new ways, often surfacing details that weren't on the original resume. Without
auto-extraction, this knowledge is lost.

#### 5c: Tactical learnings extraction (NEW)

After generating the debrief, analyze it for tactical lessons:

1. **What worked** — strong reactions, good answers, effective framing, smart questions
2. **What to improve** — stumbles, missed opportunities, interviewer redirects, gaps in knowledge
3. **Categorize each lesson:**
   - `system_design` — system design interview tactics
   - `behavioral` — storytelling, STAR method, examples
   - `ai_discussion` — AI/technology philosophy questions
   - `storytelling` — intro, elevator pitch, narrative
   - `questions_asked` — questions that worked well or fell flat
   - `signals` — reading interviewer signals
   - `interview_format` — format-specific insights (panel, technical, etc.)
4. **Read `master/interview-learnings.md`** — check if similar lessons already exist
5. **If lesson is new:** Add it under the appropriate category with source tag
6. **If lesson already exists from a prior interview:** Add the new source. If it now
   has 3+ sources, consider promoting to "proven"
7. **Present the learnings to the user:**
   - "Extracted N tactical lessons from this interview."
   - List the key ones briefly

### Step 5b: Update story and analogy deployment tracking

After extracting learnings, update deployment history in the master files:

1. **Read `master/story-bank.md`** — for each story used in this interview, update
   the "Deployed in" field with the company name, round, and context
2. **Read `master/analogy-arsenal.md`** — for each analogy/line used, update the
   "Landed in" field. Flag if the same line was used twice in one conversation.
3. **If a new story emerged** (candidate told a story not yet in the bank), add it
   to `master/story-bank.md` with proper pillar tags and deployment record
4. **If a new analogy landed well**, add it to `master/analogy-arsenal.md`

This keeps the prep builder's reuse detection current for future interviews.

### Step 6: Confirm and summarize

Give the user a brief summary covering:
- Debrief saved as `interview-debrief-rN.md`
- Key takeaway from the interview
- Assessment of signals (positive/negative/neutral)
- Number of new achievements extracted (if any)
- Number of tactical learnings captured (if any)
- Any cross-interview patterns detected
- Follow-up date set

Example: "Logged debrief for Ensemble Health Partners Round 3. Strong pass — Jesse
explicitly said you exceeded expectations. Extracted 2 new learnings (system design
tactics). 1 cross-interview pattern: AI governance is now a recurring topic across
3 interviews. Follow-up with Bethany by March 10 if no contact."

## Edge cases

- **Multiple interviews same day** — Handle each separately. Ask which one first.
- **User doesn't remember details** — Capture what they have. Even "it went well,
  they seemed interested" is useful signal for status tracking.
- **Panel interview** — Log each interviewer's focus area separately if the user
  can distinguish them.
- **Interview for company not in system** — Offer to create a minimal folder via
  job-intake first, then proceed with debrief.
- **Transcript too large for single read** — Read in chunks (offset/limit), process
  sequentially, combine into a single debrief.
- **Transcript with poor speaker identification** — Use context clues. The person
  describing the company and asking questions is the interviewer. If truly ambiguous,
  ask the user to clarify.

## Skill composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| interview-prep-builder (prepared for it) | **interview-debrief** (captures learning) | application-analytics (pattern data) |
| | | search-optimizer (strategic signals) |
| | | achievements.md (learning loop) |
| | | interview-learnings.md (tactical compounding) |
| | | story-bank.md (deployment tracking) |
| | | analogy-arsenal.md (usage tracking) |
| | | interview-prep-builder (feeds future prep) |

Read `references/debrief-template.md` for the full question framework.
