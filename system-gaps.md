# System Gaps & Roadmap

> Canonical list of system improvements identified through real usage.
> Originally discovered during Ensemble Health Partners interview prep (2026-03-04/05).
> This file lives at the project root — the copy in the Ensemble app folder is the original snapshot.

**Last updated:** 2026-03-05

---

## Gaps Found

### 1. No Job Description on File
**Problem:** Application was imported from Swooped but only had metadata.json — no job-description.md. Both company-research and interview-prep-builder skills require a JD as prerequisite.
**Impact:** Had to manually find and import the JD before any skill could run.
**Fix:** The job-intake skill should ensure a JD exists before marking an application as complete. The Swooped import pipeline should attempt to capture the JD text, not just metadata.

### 2. No Interview Transcript Import Workflow
**Problem:** Two interview transcripts existed as raw .txt files in Downloads. No skill or workflow to import them into the application folder as structured debriefs.
**Impact:** Manual effort to read transcripts and create interview-debrief files. This is the most labor-intensive part of interview prep.
**Fix:** Create an `interview-debrief` skill enhancement (or new `transcript-import` skill) that:
- Accepts a transcript file path
- Reads and analyzes the transcript
- Auto-generates a structured debrief (what was discussed, what landed, what they probed, intel gathered)
- Saves it to the application folder with proper naming (interview-debrief-r1.md, etc.)
- Updates metadata.json interview tracking

### 3. No Multi-Round Interview Tracking in metadata.json Schema
**Problem:** The original metadata.json schema has single fields (`interview_date`, `interview_round`, `interview_type`) — doesn't support tracking multiple rounds.
**Impact:** Had to add a custom `interviews` array to track all three rounds. Other skills reading metadata won't know about this field.
**Fix:** Update the metadata.json schema to include an `interviews` array as the standard way to track multi-round processes. Update all skills that read interview data.

### 4. No System Design Prep Module
**Problem:** The interview-prep-builder skill generates behavioral/strategic prep but doesn't specifically handle "system design interview" format (draw diagrams, discuss trade-offs, whiteboard architecture).
**Impact:** Had to manually create system design scenarios with ASCII diagrams and Excalidraw guidance.
**Fix:** Add a "system design" interview type handler to interview-prep-builder that:
- Identifies likely system design problems based on the role and company's domain
- Generates 2-3 design scenarios with component diagrams
- Includes a "how to draw this" guide for whiteboard/Excalidraw
- Covers key trade-offs and decision points for each scenario

### 5. Interview Debrief Skill Not Used After Previous Interviews
**Problem:** The `interview-debrief` skill exists but wasn't invoked after Rounds 1 and 2. Transcripts sat in Downloads untouched.
**Impact:** Lost the feedback loop — interview debriefs feed into better prep for future rounds. If the debriefs had been captured after R1 and R2, the interview-prep-builder would have had richer input for R3.
**Fix:** Consider a reminder/prompt after each interview: "You had an interview with [company] — want to run a debrief?" Could be triggered by calendar integration or manual prompt.

### 6. Company Research Links Not Captured
**Problem:** Bethany sent YouTube, whitepaper, and HIMSS TV links. These aren't stored in the application folder or referenced in metadata.
**Impact:** Had to manually extract and research these links during prep.
**Fix:** Add a `resources` or `links` field to metadata.json for recruiter-provided materials. Company-research skill should check for and process these.

### 7. No Drawing Tool Recommendation
**Problem:** Interview required screen sharing with diagrams. No part of the system recommends or ensures a drawing tool is ready.
**Fix:** Interview-prep-builder should check interview type. If "system design" or "technical panel," add a checklist item for drawing tool setup and recommend Excalidraw.

### 8. metadata.json match_score Was Empty
**Problem:** Application was in "interviewing" status but had never been scored. No match score, no gaps, no keywords.
**Impact:** Interview-prep-builder couldn't generate gap bridges from the match score — had to analyze gaps manually.
**Fix:** Ensure scoring happens during job-intake and is a prerequisite for interview-prep-builder. If score is empty, prompt to run scoring first.

### 9. No Auto-Learning from Interview Transcripts to achievements.md
**Problem:** Interview transcripts contain achievement gold — specific numbers, technical details, leadership stories — that the candidate shares verbally but aren't captured in `master/achievements.md`. This session manually extracted 7 new achievements from two transcripts (integration engine details, call stacking automation, auto-scaling architecture, org scaling numbers, risk stratification models, managing managers, zero-access CI/CD).
**Impact:** Every interview makes the candidate articulate their experience in new ways, often surfacing details that weren't on the original resume. Without auto-extraction, this knowledge is lost until someone manually reads the transcript.
**Fix:** Add an achievement extraction step to the `interview-debrief` skill:
1. Parse what the candidate said (vs what the interviewer said)
2. Identify quantified achievements, technical specifics, and leadership examples
3. Compare against existing `achievements.md` to find NEW items only
4. Present candidates for user confirmation ("Found 7 new achievements — add them?")
5. Append confirmed items with `[learned: YYYY-MM-DD]` tags
6. This should run automatically as part of debrief generation, not as a separate step

**Why this matters at scale:** For the web app (Savannah + other users), this creates a compounding knowledge flywheel — every interview makes the system smarter about the candidate, which makes future resume tailoring, cover letters, and interview prep more accurate.

### 10. No Interview Learnings Extraction
**Problem:** After every interview, there are tactical lessons — what worked, what didn't, what to do differently next time. These lessons are either lost entirely or trapped in individual debrief files where no one reads them again. There's no system to accumulate and surface these learnings for future interviews.
**Impact:** The same mistakes repeat across interviews. Lessons like "take interviewer redirects faster" or "have specific NoSQL names ready" are discovered, forgotten, and rediscovered. For multi-user (web app), users can't benefit from each other's learnings.
**Fix:** Add a learnings extraction step to the `interview-debrief` skill:
1. After generating the structured debrief, analyze for tactical lessons: what landed, what stumbled, what to do differently
2. Categorize lessons by interview type (system design, behavioral, recruiter screen, etc.)
3. Write to `master/interview-learnings.md` — an accumulating knowledge base organized by category
4. When the same lesson appears across 3+ interviews, promote it from "observed" to "proven"
5. The `interview-prep-builder` skill reads this file and incorporates relevant proven lessons into prep materials
6. For the web app: learnings are per-user but cross-interview patterns could be surfaced in analytics

**Why this matters:** Every interview should make the next one better. Right now the system captures WHAT happened but not WHAT TO DO ABOUT IT. This closes the loop between debrief (past) and prep (future).

---

## Implementation Plan

### Phase 1: Schema & Foundation (do first — everything else depends on this)

| Gap | What to Build | Where | Effort |
|-----|---------------|-------|--------|
| **#3** Multi-round interview tracking | Add `interviews[]` array to schema | `apps/web/src/schemas/application.ts`, `apps/web/src/types/index.ts`, Supabase migration, `skills/job-intake/SKILL.md` | Low |
| **#6** Resource links | Add `resources[]` field to schema | Same files as #3 | Low |
| **#8** Match score prerequisite | Add validation gate — score must exist before interview-prep runs | `skills/interview-prep-builder/SKILL.md`, `skills/job-intake/SKILL.md` | Low |
| **#1** JD capture on import | Require `job_description` text before intake marks complete | `skills/job-intake/SKILL.md`, `email_parse.py` | Low |

**Schema changes for `interviews[]`:**
```json
"interviews": [
  {
    "round": 1,
    "type": "recruiter_screen | hiring_manager | technical_panel | behavioral | system_design | final",
    "date": "YYYY-MM-DD",
    "interviewer": "Name, Title",
    "duration": "30 min",
    "focus": "optional",
    "notes_file": "interview-debrief-r1.md",
    "status": "scheduled | completed | cancelled",
    "outcome": "optional free text"
  }
]
```

**Web app screens needed (Phase 1):**
- **Tracker detail `[id]` page** — Add interviews timeline/accordion showing all rounds, status badges, links to debrief notes
- **Supabase** — `interviews` JSONB column on applications table (or separate `interviews` table with FK)

---

### Phase 2: Interview Debrief Skill Overhaul (the big one)

Enhance `skills/interview-debrief/SKILL.md` with three new paths:

| Gap | New Capability | Details |
|-----|---------------|---------|
| **#2** Transcript import | **Step 2b: Transcript path** | Accept `.txt` file → parse speakers → auto-generate structured debrief → save as `interview-debrief-rN.md` → update `interviews[]` in metadata |
| **#9** Achievement extraction | **Step 5b: Achievement mining** | Parse what candidate said → find quantified achievements → diff against `master/achievements.md` → present for confirmation → append with `[learned]` tag |
| **#10** Learnings extraction | **Step 5c: Tactical learnings** | Analyze debrief for what worked/stumbled → categorize by interview type → write to `master/interview-learnings.md` → promote to "proven" at 3+ occurrences |

**Updated interview-debrief workflow:**
```
Step 1: Identify application (existing)
Step 2: Debrief conversation OR transcript import (enhanced)
  2a: Conversational debrief (existing — user tells you what happened)
  2b: Transcript import (NEW — user provides .txt file path)
      → Read transcript
      → Identify speakers (candidate vs interviewer(s))
      → Extract: topics discussed, what landed, what was probed, intel, signals
      → Generate interview-debrief-rN.md
Step 3: Create/save debrief file (existing, now handles both paths)
Step 4: Update metadata.json interviews[] (enhanced for multi-round)
Step 5: Feed the learning loop (enhanced)
  5a: Cross-interview pattern detection (existing)
  5b: Achievement extraction (NEW — #9)
      → Parse candidate statements for quantified wins
      → Diff against master/achievements.md
      → Present candidates: "Found N new achievements — add them?"
      → Append confirmed with [learned: YYYY-MM-DD]
  5c: Tactical learnings extraction (NEW — #10)
      → What worked (strong reactions, good answers, effective framing)
      → What to improve (stumbles, missed opportunities, redirects taken)
      → Categorize: system_design | behavioral | ai_discussion | storytelling | questions_asked | signals
      → Write to master/interview-learnings.md under correct category
      → If lesson already exists from prior interview, add source and check for promotion to "proven"
Step 6: Confirm and summarize (existing, now includes learning/achievement counts)
```

**Web app screens needed (Phase 2):**
- **Interview debrief page** — Upload transcript OR paste text → AI generates structured debrief → review/edit → save
- **Achievements page** — View `achievements.md` equivalent, see `[learned]` tags, add/edit
- **Learnings page** — View accumulated learnings by category, see "observed" vs "proven" status, filter by interview type

---

### Phase 3: Interview Prep Builder Enhancements

| Gap | New Capability | Details |
|-----|---------------|---------|
| **#4** System design prep | Interview type handler | Detect `system_design` or `technical_panel` type → generate 2-3 domain-relevant design scenarios with component diagrams, trade-offs, decision points |
| **#7** Drawing tool recommendation | Checklist addition | If interview type is system design/technical → add "Drawing tool ready?" to pre-interview checklist, recommend Excalidraw |
| **#10** Consume learnings | Read `master/interview-learnings.md` | Pull relevant "proven" lessons into prep doc under "Lessons from Past Interviews" section. Match by interview type. |

**Updated interview-prep-builder reads:**
```
Inputs (existing):
  - metadata.json (match_score, gaps, keywords)
  - job-description.md
  - master/achievements.md
  - Previous interview-notes.md files (cross-app patterns)

Inputs (NEW):
  - master/interview-learnings.md → "Proven" lessons matching this interview type
  - interviews[] from metadata → Previous round debriefs for THIS company
  - master/interview-learnings.md → "What to improve" items as reminders

New output sections:
  - "Lessons from Past Interviews" — proven tactical advice
  - "System Design Scenarios" — if interview type warrants it
  - "Pre-Interview Checklist" — enhanced with drawing tool, prior round intel
```

**Web app screens needed (Phase 3):**
- **Interview prep page** — Generate prep from web UI, select interview type, see prior round debriefs inline
- **System design library** — Browse/save reusable design scenarios (optional, nice-to-have)

---

### Phase 4: Workflow & Reminders

| Gap | New Capability | Details |
|-----|---------------|---------|
| **#5** Post-interview debrief reminder | Prompt after interview | After interview_date passes for a scheduled interview, surface a reminder: "You had an interview with [company] — ready to debrief?" |

**Web app:** Dashboard notification when `interviews[].date` is in the past and `interviews[].status` is still "scheduled"

**Status: DONE** — Purple alert card on dashboard showing "N interviews need debrief" with company/round list. Links to application detail page. API queries `interviews` JSONB column, filters client-side for scheduled + past date.

---

## Priority Recommendations

| Priority | Gap | Phase | Effort | Impact |
|----------|-----|-------|--------|--------|
| **High** | Auto-learn achievements from transcripts (#9) | 2 | Medium | Compounding knowledge flywheel — every interview makes the system smarter |
| **High** | Interview learnings extraction (#10) | 2 | Medium | Closes debrief→prep loop — every interview makes the next one better |
| **High** | Interview transcript import workflow (#2) | 2 | Medium | Saves 30+ min per interview debrief |
| **High** | Multi-round interview tracking (#3) | 1 | Low | Schema change + skill updates |
| **High** | System design prep module (#4) | 3 | Medium | Critical for technical interviews |
| **Medium** | JD capture on import (#1) | 1 | Low | Prevents missing prerequisite |
| **Medium** | Match score prerequisite (#8) | 1 | Low | Ensures skills have input data |
| **Low** | Resource links in metadata (#6) | 1 | Low | Nice to have |
| **Low** | Drawing tool recommendation (#7) | 3 | Low | Checklist addition |
| **Low** | Post-interview debrief reminder (#5) | 4 | Medium | Workflow improvement |

## Summary: What Gets Built

### CLI Skills (Jimmy via Claude Code)
| Skill | Action |
|-------|--------|
| `interview-debrief` | **Major overhaul** — transcript import, achievement mining, learnings extraction |
| `interview-prep-builder` | **Enhancement** — system design module, learnings consumption, drawing tool checklist |
| `job-intake` | **Minor** — require JD, require scoring, support `interviews[]` and `resources[]` |

### Web App (Savannah + Jimmy via browser)
| Screen | Action |
|--------|--------|
| Tracker detail `[id]` | **Enhancement** — interviews timeline, debrief links, round status |
| Interview debrief (NEW) | **New page** — transcript upload/paste, AI-generated debrief, review/save |
| Achievements (NEW) | **New page** — view/edit achievements, see learned tags |
| Interview learnings (NEW) | **New page** — accumulated lessons by category, observed vs proven |
| Interview prep (NEW) | **New page** — generate prep from web, prior round context |
| Dashboard | **Enhancement** — post-interview debrief reminder notifications |

### Schema / Data
| Change | Action |
|--------|--------|
| `interviews[]` array | Add to metadata.json schema, Zod schema, TypeScript types, Supabase |
| `resources[]` array | Add to metadata.json schema, Zod schema, TypeScript types, Supabase |
| `master/interview-learnings.md` | **Created** (done) — learnings knowledge base |
| `master/achievements.md` | No schema change — skill writes to it with `[learned]` tags |
