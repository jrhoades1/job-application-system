# Signature Story Bank — Jimmy Rhoades

> Catalogued stories for interview use. The interview-prep-builder selects stories
> based on pillar tags and role requirements. Each story has a short version (60 sec)
> and full version (2-3 min). Track deployment per interview to avoid reuse.

---

## Stories

### 1. Insurance Call Stacking
**Company:** ilumed | **When:** CTO tenure
**Short version:** Staff calling insurance companies had massive hold times. Built a system that queued the next 3 patients when operators got Blue Cross on the line. Dramatically improved throughput.
**Full version:** Include the workflow — operators sitting on hold, the queue system detecting which insurer was live, auto-loading the next patients for that insurer, reducing per-call overhead from minutes to seconds.
**Numbers:** Dramatic throughput improvement (quantify if possible from memory)
**Pillars:** `business-value`, `efficiency`, `automation`, `creative-problem-solving`
**Best for:** "How do you deliver business value?" / "Give me an example of a creative technical solution" / "How do you identify what to automate?"
**Deployed in:** Ensemble R2 (Pillar 1 + Pillar 2 — used twice, avoid in future)

### 2. Team Scaling 4 to 25
**Company:** ilumed | **When:** CTO tenure (company grew 140→200)
**Short version:** Scaled engineering org from 4 to 25. First hires were cultural — leads who move things forward. Then processes (agile ceremonies). Then scaled with more engineers.
**Full version:** Include hiring sequence philosophy, retention approach, managing managers for first time at MedQuest then again here, weekly one-on-ones as non-negotiable.
**Numbers:** 4→25 engineers, company 140→200 total headcount
**Pillars:** `team-building`, `scaling`, `leadership`, `culture`
**Best for:** "How have you built teams?" / "How do you scale?" / "What's your hiring philosophy?"
**Deployed in:** Ensemble R2 (Pillar 3 + Pillar 4)

### 3. Protocol-Agnostic Integration Engine
**Company:** ilumed | **When:** CTO tenure
**Short version:** Built integration engine connecting to 18+ hospital systems — Epic, Athena, CMS — via FHIR, HL7, REST APIs. Bi-directional: read data in, push alerts/notes back to source EHRs. Protocol-agnostic — spoke whatever language each system required.
**Full version:** Include rate limiting (governors), clearinghouses, Twilio for SMS/phone outreach, the "speak whatever language they want" analogy.
**Numbers:** 18+ systems, 50K→90K beneficiaries, 99.9% uptime
**Pillars:** `architecture`, `healthcare-interop`, `technical-depth`, `scalability`
**Best for:** "Walk me through a system you architected" / "Healthcare integration experience?" / "How do you handle complex integrations?"
**Deployed in:** Ensemble R1 (pitch), R2 (data integration deep-dive), R3 (healthcare protocols validation)

### 4. 5-Part System Architecture
**Company:** ilumed | **When:** CTO tenure
**Short version:** Designed the full platform as 5 interlocking systems: (1) data ingestion from CMS/hospitals/EMRs, (2) risk stratification models for prioritization, (3) work lists for nurse practitioners, (4) workflow/interaction tracking across modalities, (5) reporting and feedback loop.
**Full version:** Walk through each layer with the data flow between them. Emphasize the feedback loop — reporting drives model improvement which drives better work lists.
**Numbers:** 18+ data sources, multiple modalities (text, email, phone via Twilio)
**Pillars:** `architecture`, `structured-thinking`, `systems-design`, `healthcare`
**Best for:** "How do you think about system design?" / "Describe a complex system you built" / VP/director interviews where you need to show big-picture thinking
**Deployed in:** Ensemble R2 (Pillar 1)

### 5. Easter Island / Rongorongo
**Company:** Personal project
**Short version:** Applying NLP and ML to undeciphered rongorongo glyphs from Easter Island — digitizing corpora, fine-tuning multilingual LLMs on an unsolved linguistic mystery.
**Full version:** Explain the challenge (fewer than 30 surviving artifacts, no Rosetta Stone equivalent), your approach (computational linguistics meets modern AI), what it shows (genuine intellectual curiosity, AI applied to non-obvious domains).
**Numbers:** N/A — this is a passion/curiosity story
**Pillars:** `ai-passion`, `intellectual-curiosity`, `differentiation`
**Best for:** Recruiter screens (bonding), "What are you passionate about?", showing genuine AI interest vs resume padding
**Deployed in:** Ensemble R1 (Bethany loved it)

### 6. Diagnostic Imaging Turnaround
**Company:** MedQuest | **When:** Director tenure
**Short version:** Inherited a failing diagnostic imaging system. Revamped it to production-ready across 100 centers in 13 states.
**Full version:** Include the scale (100 centers, 13 states), the "inheriting a mess" narrative, the systematic approach to stabilization.
**Numbers:** 100 centers, 13 states
**Pillars:** `turnaround`, `enterprise-scale`, `reliability`, `leadership`
**Best for:** "Tell me about a project that was failing" / "How do you handle inherited technical debt?" / enterprise-scale questions

### 7. Automated Insurance Verification
**Company:** MedQuest | **When:** Director tenure
**Short version:** Automated insurance verification process, reducing errors by 60% and saving 500+ staff hours annually.
**Numbers:** 60% error reduction, 500+ staff hours saved/year
**Pillars:** `automation`, `efficiency`, `business-value`, `healthcare`
**Best for:** "How do you identify automation opportunities?" / ROI-focused questions

### 8. Monolith to Microservices
**Company:** Cognizant | **When:** Director tenure
**Short version:** Transformed monolithic application into scalable microservices and multi-tenant architecture. Cut latency by 20% across patient-facing platforms.
**Numbers:** 20% latency reduction, 50+ developers managed across US/Ukraine/Central America
**Pillars:** `architecture`, `modernization`, `scalability`, `technical-depth`
**Best for:** "Migration experience?" / "Microservices trade-offs?" / architect-level questions

### 9. Dark Software Factory
**Company:** Personal/current project
**Short version:** Building a methodology where specs go in and tested code comes out — skills architecture with reusable skills at org level, data at project level, intent embedded with hierarchical priority.
**Full version:** Include the intent hierarchy (values > business rules > operational rules), the call center example, the "software deserts" concept.
**Pillars:** `ai-vision`, `methodology`, `innovation`, `differentiation`
**Best for:** "What's your AI vision?" / "How are you using AI today?" / technical leadership discussions
**Deployed in:** Ensemble R3 (AI discussion — landed very well)

---

## Selection Guide

When prepping for an interview, select stories based on:

1. **Role requirements** — match pillars to job description keywords
2. **Round type** — recruiter gets short versions + passion stories, HM gets full versions with numbers, technical gets architecture stories
3. **Deployment history** — check "Deployed in" to avoid repeating stories to the same company
4. **Gap bridging** — if there's a gap, find the story with the closest adjacent experience
