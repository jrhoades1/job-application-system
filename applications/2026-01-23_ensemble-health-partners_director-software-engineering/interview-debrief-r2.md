# Interview Debrief — Round 2: VP of Software Engineering

**Company:** Ensemble Health Partners
**Role:** Director, Software Engineering (Pod Leader)
**Date:** Friday, February 20, 2026 (11:00am EST)
**Interviewer:** Matthew Grose, VP of Software Engineering
**Duration:** ~45 minutes
**Format:** Video call

---

## What Was Discussed

### Matthew's Context Setting
- **"Pod leader is the most important role in engineering"** — direct quote from their CTO earlier that day
- Pod leaders represent their team(s) to executive level on both business and technology side
- Expected to maintain delivery expectations AND engineering excellence
- Matthew is currently playing interim pod leader for the A/R follow-up team

### Your Pitch (What You Said)
- 20 years in healthcare, leading teams and shipping code
- Built teams from zero to 20, also took existing teams and built them up — multiple times
- CTO at value-based care org in South Florida
- Hardened existing system, implemented AI in risk stratification
- Medicare beneficiaries — managing risk across organizations
- Appealed by Ensemble's healthcare + AI combination
- Philosophy: "If you're not running out of tokens every day, you're not thinking big enough"
- Building with AI coding agents — code documentation quality dramatically improved
- Pre-Thanksgiving AI was "not working," by Christmas it worked well, by now another level up

### Matthew's Key Framework — Three Pillars
He structured the interview around his evaluation of what the role needs:
1. **Delivering real value**
2. **Delivering value faster**
3. **Scaling**

### Pillar 1: Delivering Real Value (Your Response)
- Value = what the business can use to be faster, more efficient, more profitable
- Not about Jira tickets completed — about business outcomes
- **Insurance call stacking story (ilumed):** Staff calling insurance, long hold times. Built system that queued next 3 patients when they got Blue Cross on the line. Massive efficiency gain.
- 5-part system architecture at ilumed:
  1. **Data ingestion** — feeds from CMS, hospitals, EMRs (Epic, Athena, 18+ connections)
  2. **Risk stratification models** — data scientists building who-to-contact-today models
  3. **Work lists** — nurse practitioners calling off prioritized lists
  4. **Workflow/interaction tracking** — modalities (text, email, phone), attempt tracking, patient communication preferences
  5. **Reporting** — how are we doing in each phase, what needs improvement, rinse and repeat

### Technical Deep Dive: Data Integration (Matthew Probed Here)
- Integration engine was **agnostic** — FHIR, HL7, RESTful APIs, whatever the source provided
- Had to handle rate limits (governors) — sources would shut you off if you pulled too much
- **Bi-directional:** Read data in, but also pushed alerts/notes back to primary care physicians
- Used Twilio for SMS/phone outreach
- Clearinghouses for additional data
- **Matthew's connection:** "This resonates very much with Ensemble" — they consume data from partner EMRs into a central store, do intelligence, push results back to source systems

### Pillar 2: Delivering Value Faster (Your Response)
- **Security over speed** — non-negotiable. If you have to choose, choose security.
- AI for rapid prototyping — "let's race them" approach (build two solutions, see which survives)
- Cost consciousness — tokens, cloud costs, treated like own money
- **Define what "faster" means first** — people have different definitions. Getting list to zero vs. getting it done accurately.
- Same insurance call stacking example reused — faster = clear work list + quality gates

### How You Measured "Faster"
- Reporting on every metric
- Success = patient didn't have a medical emergency (healthy outcome)
- Triage approach: "Get rid of the murderers first, then rapists, then jaywalkers" — tackle biggest impact items first
- Give autonomy on smaller items — let team experiment with solutions

### Pillar 3: Scaling (Your Response)
- Scaling = define what you're trying to scale first
- **Data ingestion was the bottleneck** — massive volumes from CMS, hospitals, EMRs
- Needed denormalized data for work lists to perform (star schema issues with normalized data)
- **Auto-scaling solution in AWS:** Ramp up processors/agents before nightly CMS pulls, scale back down after completion
- Scaling isn't just technical — it's having the right person at the right time (doctor, nurse, social worker)

### Pillar 4: Accountability (Your Response)
- Weekly one-on-ones — non-negotiable
- Individualized approach — "pizza under the door" for senior devs, more guidance for junior
- Trust piece — "let's look each other in the eyes, this isn't working, why?"
- Focus on removing blockers, not punishment
- Individual plans with weekly check-ins
- Test cases as quality gate — "requirement isn't finished until you can tell how to test it"
- Bug counts dropped dramatically when team started communicating requirements as test cases
- **Trust but verify:** CI/CD pipeline with automated security checks, secrets scanning — non-negotiable gates
- "It should be fun" — retention through positive culture

### Managing Managers Experience
- **MedQuest:** First time managing managers
- **Cognizant:** Large org, managing managers + cross-functional stakeholders
- Getting alignment across competing priorities — "everyone pulling the wagon the same direction"
- Security teams at Cognizant whose "job was to tell you no" — had to find compromises

### Team Scaling Details (Matthew Probed)
- Company grew from 140 to 200 total headcount
- Your org: 4 to 25 engineers
- First hires: cultural — leads who help move things forward
- Then: processes — agile ceremonies
- Then: scale with more engineers

### Your Questions to Matthew

**Q: Do related portfolio companies (Exorah Health, etc.) share code?**
- A: No, only Ensemble. Revenue model = percentage of customer revenue. 99.9% of software is about improving revenue and patient experience for customers.

**Q: What should the first 10 hires focus on?**
- A: CEO wants first 10 hired in 3 weeks. Focus area for this pod: **A/R follow-up** (accounts receivable — everything billed but not received expected amount)
- Goal: automate A/R follow-up end-to-end
- Existing team that Matthew is leading as interim pod leader
- Ultimately: ~4 teams, ~25 engineers
- Current state: incrementally making progress on automation
- Next phase: strategic + holistic approach with AI engineering org

**Q: AI philosophy?**
- A: "It depends" — nothing off the table if agreed-upon value
- Initial focus: **end-to-end without human touch** (with high reliability/quality bar)
- Then: incremental value-adds (human-in-the-loop, partial automation)
- Foundation is **deterministic,** enriched with AI on top
- Work queues trigger automation — could be deterministic engineering or AI-driven

---

## What Landed Well
- Insurance call stacking story — concrete, relatable, business-value focused
- 5-part system architecture breakdown — showed structured thinking
- Data integration experience (Epic, Athena, FHIR, HL7) — **directly maps to Ensemble's architecture**
- "Security over speed" principle — resonated with healthcare context
- Token usage philosophy — showed genuine AI engagement
- Trust but verify with CI/CD automation — practical, not theoretical
- Test cases reducing bugs — actionable leadership

## What They Probed Deeply On
- **Data integration specifics** — how you connected to hospital systems, permissions, FHIR vs HL7 vs API
- **Bi-directional data flow** — read + write back to source systems
- **Managing managers** — HR-perspective experience, not just dotted-line
- **Scaling your org** — specific numbers, hiring sequence
- **Accountability at team level** — beyond individual one-on-ones

## What Matthew Revealed About the Role
- **A/R follow-up is THE focus area** — automating end-to-end
- **Deterministic foundation + AI enrichment** — hybrid approach
- **Work queues and automation** — claims assigned to queues trigger actions
- **Revenue model alignment** — more money clients make, more Ensemble makes
- **CEO driving urgency** — wants first hires in weeks, not months
- **Matthew is interim pod leader** — he's doing the job now, needs someone to take over

## Gaps Identified / Areas for Tomorrow
- Matthew didn't get to probe system design specifically — **Round 3 will go deep here**
- Azure wasn't discussed — your experience is primarily AWS. Be ready for Azure questions.
- .NET Core / TypeScript not discussed — may come up with the SE interviewer
- You didn't get to ask about their specific tech stack or architecture patterns
- The "managing managers" answer could have been stronger — have a crisper example ready

## Intel to Carry Forward
- **"Pod leader" = Director title internally.** CTO says it's the most important role.
- **A/R follow-up = your pod's domain.** Know this cold.
- **Deterministic + AI hybrid** is their architectural philosophy
- **Matthew resonated with your data integration experience** — your ilumed work maps almost 1:1 to what Ensemble does
- **They consume EMR data → central store → intelligence → push back to source** — this IS your architecture experience
- **Jesse Estum (VP of SE) is interviewing you in Round 3** — different VP than Matthew. Understand the org structure.
- **Dragon Sky (SE) will be technical** — expect code-level and architecture questions
