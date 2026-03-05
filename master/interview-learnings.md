# Interview Learnings — Compounding Knowledge Base

> Tactical lessons extracted from every interview debrief. The interview-debrief
> skill writes to this file; the interview-prep-builder skill reads it before
> generating prep. Patterns reinforce over time — a lesson confirmed across
> multiple interviews moves from "observed" to "proven."
>
> **How this file grows:** Each entry is tagged with the source interview(s) and
> date. When the same lesson appears across multiple interviews, consolidate into
> one entry with multiple sources. Delete or demote lessons that prove wrong.

---

## System Design Interviews

### What Works
- **Lead with clarifying questions before drawing.** Ask about constraints (human-readable? max length? fixed domain?) before sketching. Shows you understand the problem before solving it. [Ensemble R3, 2026-03-05]
- **Sketch high-level first, then drill in.** Start with boxes for major components (input, processing, storage, output), then add detail. Interviewers at the director level want to see you can frame a system, not implement it. [Ensemble R3, 2026-03-05]
- **Identify user journeys explicitly.** Name them ("create flow" vs "consume flow") and confirm with the interviewer which to focus on. This shows product thinking alongside technical thinking. [Ensemble R3, 2026-03-05]
- **Catch your own trade-offs.** When you propose a write queue for scaling, immediately flag the eventual consistency risk. Interviewers love when you identify the downside of your own suggestion. [Ensemble R3, 2026-03-05]

### What to Improve
- **Take interviewer redirects immediately.** If they say "let's not go down that path," pivot instantly. Going down the encryption/hashing rabbit hole for 3 minutes cost time. The redirect IS the signal — they've already decided that path isn't productive. [Ensemble R3, 2026-03-05]
- **Have specific NoSQL names ready for scaling discussions.** When pushed past relational DB limits, name the alternatives: Redis (cache/lookup), DynamoDB (key-value at scale), Cassandra (write-heavy), MongoDB (document store). "I don't think I'd hit that limit" is honest but leaves the interviewer probing. [Ensemble R3, 2026-03-05]
- **Don't fight the hypothetical.** If the interviewer sets up a scenario ("imagine you're at massive scale"), play along even if you think it's unlikely. The question is testing whether you know the tools, not whether the scenario is realistic. [Ensemble R3, 2026-03-05]

### Calibration by Level
- **Director level:** Sketch a working system, ask good questions, identify trade-offs. NOT expected to deep-dive into hashing algorithms or database internals. [Ensemble R3, Jesse Estum: "for a director, that's not necessary — can you sketch something that could work, ask good questions, pick up the business problem"]
- **Staff level:** Would be expected to drill into encryption/randomizer specifics, database scaling characteristics, specific NoSQL trade-offs. [Ensemble R3, Jesse Estum described different expectations by level]

---

## AI / Technology Discussions

### What Works
- **"If you're not running out of tokens you're not thinking big enough"** — Strong line that positions you as a bold thinker on AI. Landed well. Caution: only use once per conversation. [Ensemble R3, 2026-03-05]
- **The "software deserts" concept resonates.** $500K dev team can't solve $1,000 problem — AI changes that math. Interviewers immediately connect this to their own bottlenecks. Concrete and memorable. [Ensemble R3, 2026-03-05]
- **Intent hierarchy (values > business rules > operational rules) is differentiating.** The three-minute call center example makes it immediately tangible. Shows you've thought about AI governance beyond just "use AI for everything." [Ensemble R3, 2026-03-05]
- **Be honest about AI's evolution timeline.** "Pre-Thanksgiving it missed a lot, by December it looked pretty good, now we argue about taste" — gives you credibility as someone who actually uses AI, not just talks about it. [Ensemble R3, 2026-03-05]

### What to Improve
- **Avoid repeating strong lines.** "Running out of tokens" was used twice in the same interview. The second time dilutes the first. Save your best lines for the moment they hit hardest. [Ensemble R3, 2026-03-05]

---

## Introductions & Storytelling

### What Works
- **30-second intro format:** Past (20 years healthcare), present (CTO, integration engine, AI/ML), future (what excites me about this role). Jesse called it "excellent framing." Keep it tight — don't ramble past 45 seconds. [Ensemble R3, 2026-03-05]
- **Name specific systems, not generic terms.** "Epic, Cerner, Athena" not "various EHR systems." "FHIR, HL7, EDI" not "healthcare protocols." Specificity builds credibility. [Ensemble R3, 2026-03-05]
- **Bridge from technical to business.** "I got an MBA because management didn't speak tech and tech didn't speak management" — this narrative resonates because it explains the career trajectory. [Ensemble R3, 2026-03-05]

### What to Improve
- (No improvements flagged yet — intro landed well across all 3 Ensemble rounds)

---

## Questions to Ask Interviewers

### What Works
- **Ask about acquisition integration friction.** If they've acquired a company, ask how the teams are merging. Shows strategic thinking and homework. Gets detailed insider answers. [Ensemble R3, 2026-03-05 — Mendel AI question got a long, candid response from Jesse]
- **Ask about pod/team structure philosophy.** Different from "how big is the team" — it shows you think about how teams are organized to deliver, not just headcount. [Ensemble R3, 2026-03-05]

### What to Improve
- (No improvements flagged yet)

---

## Reading Interviewer Signals

### Strong Positive Signals Confirmed
- **Sharing detailed insider info** (org friction, acquisition challenges, team philosophy) = they're selling you on the reality of the role, not screening you out. [Ensemble R3, 2026-03-05]
- **Explicit positive feedback** during the interview ("you more than met expectations," "excellent framing") = uncommon, very strong signal. [Ensemble R3, 2026-03-05]
- **Using full time allocation** and relaxed pacing = they're comfortable with you. Rushed interviews are often screening out. [Ensemble R3, 2026-03-05]
- **"Bethany should be in contact on short order for next steps"** = intent to advance, not a polite brush-off. [Ensemble R3, 2026-03-05]

---

## Cross-Interview Patterns

> Patterns observed across multiple interviews. Updated as data accumulates.
> Minimum 3 occurrences to flag a pattern.

(No patterns yet — tracking begins with first debrief entries.)

---

## Interview Format Insights

### Technical Panels
- **System design at director level is about framing, not implementation.** The interviewer adjusts depth expectations by level. Ask where they want depth if unclear. [Ensemble R3, 2026-03-05]
- **"No right answer, probably a wrong answer"** — Jesse's framing. The exercise tests process and communication, not a specific solution. Talk through your thinking out loud. [Ensemble R3, 2026-03-05]
- **Practice with the drawing tool beforehand.** Fumbling with Excalidraw/Miro controls during the interview wastes time and breaks flow. Jesse was gracious about it but it added friction. [Ensemble R3, 2026-03-05]

### VP / Hiring Manager Screens
- (Populated from future debriefs)

### Recruiter Screens
- (Populated from future debriefs)
