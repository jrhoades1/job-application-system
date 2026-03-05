# System Gaps Identified — Interview Prep Dry Run

**Date:** 2026-03-04
**Context:** Preparing for Ensemble Health Partners Round 3 interview. Used this as a dry run to identify what's missing from the job application system for interview prep.

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

## Priority Recommendations

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| **High** | Auto-learn achievements from transcripts (#9) | Medium | Compounding knowledge flywheel — every interview makes the system smarter |
| **High** | Interview learnings extraction (#10) | Medium | Closes debrief→prep loop — every interview makes the next one better |
| **High** | Interview transcript import workflow (#2) | Medium | Saves 30+ min per interview debrief |
| **High** | Multi-round interview tracking (#3) | Low | Schema change + skill updates |
| **High** | System design prep module (#4) | Medium | Critical for technical interviews |
| **Medium** | JD capture on import (#1) | Low | Prevents missing prerequisite |
| **Medium** | Match score prerequisite (#8) | Low | Ensures skills have input data |
| **Low** | Resource links in metadata (#6) | Low | Nice to have |
| **Low** | Drawing tool recommendation (#7) | Low | Checklist addition |
| **Low** | Post-interview debrief reminder (#5) | Medium | Workflow improvement |
