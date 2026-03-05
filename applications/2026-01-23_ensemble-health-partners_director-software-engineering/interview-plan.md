# Interview Plan — Ensemble Health Partners Round 3

**Date:** March 5, 2026 | **Time:** 9:30am EST | **Duration:** 75 minutes
**Panel:** Jesse Estum (VP of SE) + Dragon Sky (SE)
**Focus:** System design and engineering principles

---

## Strategic Positioning

**Lead with:** Your data integration experience mapping 1:1 to Ensemble's architecture (ingest from EMRs → central intelligence → push back to source). This is your strongest differentiator — most Director candidates won't have built this exact pattern in healthcare.

**Secondary angle:** Three-time team builder from zero. Orchestration Works needs someone who's done this before and knows the sequence (culture → process → scale).

**Tertiary angle:** You already think in their framework — deterministic foundation + AI enrichment. You lived this at ilumed before they named it.

---

## Anticipated Interview Focus (75 minutes)

| Time | Likely Activity | Your Approach |
|------|----------------|---------------|
| 0-5 min | Intros, context setting | Brief pitch: "20 years healthcare, 3 teams from zero, built data integration platforms that sound a lot like what you're doing here." |
| 5-30 min | System design exercise | They'll give you a problem (likely A/R automation). Clarify → draw → discuss trade-offs. Use Excalidraw. |
| 30-50 min | Engineering principles deep dive | How you think about security, testing, scaling, tech debt, AI guardrails |
| 50-65 min | Leadership / team questions | How you build teams, manage managers, work with ops partners |
| 65-75 min | Your questions for them | Use the prepared questions — show homework |

---

## Company-Specific Talking Points

### "Drop this when" triggers:

| If They Ask About... | Drop This |
|-----------------------|-----------|
| Data integration / EHR connectivity | "At ilumed, I built an agnostic integration engine — FHIR, HL7, REST APIs — connecting to 18+ systems including Epic and Athena. Bi-directional: we read data in and pushed alerts back to PCPs. We had to handle rate limiting, governor controls, and source systems that would shut you off if you pulled too hard." |
| A/R follow-up / claims processing | "At MedQuest, I automated insurance verification — 60% error reduction, 500+ hours saved annually. At ilumed, we built work lists from risk stratification models. The pattern is the same: ingest claims data, classify by priority, route to the right action, and track outcomes." |
| AI in healthcare | "At ilumed, we used ML for risk stratification — predicting which beneficiaries needed outreach. At Perceptive, AI integration cut development cycles 30% and boosted adoption 40%. I'm also actively building with AI coding agents — I believe in using the tools, not just talking about them." |
| Scaling / architecture | "Our biggest scaling challenge at ilumed was data ingestion. We built auto-scaling infrastructure — ramp up processors before nightly batch loads from CMS and hospitals, scale back down after. We also had to denormalize data for work list performance — star schema queries were too slow. On Azure, that's Service Bus for queuing and AKS or Functions for the compute scaling." |
| Team building | "First hires are cultural — the leads who set the tone. Then processes — agile ceremonies, testing standards, code review. Then scale. I've done this 0→22 at MedQuest, 0→15 at Red Spot, 0→10 at Perceptive." |
| Cohere / agentic AI | "The horizontal orchestration approach — agents across the full revenue cycle, not point solutions — is the right architecture. And the 40% A/R automation number tells me the opportunity is real. The key is the guardrails layer — confidence thresholds, human escalation, audit trails." |
| Security / compliance | "Security over speed, every time. Non-negotiable CI/CD gates: automated tests, secrets scanning, security checks. At ilumed, we maintained HIPAA compliance with 99.9% uptime while scaling 55%. I also led SOC2/HITRUST certification prep." |

---

## Stack Alignment — Strengths, Not Gaps

| Area | Status | Your Positioning |
|------|--------|-----------------|
| **Azure** | **Direct match** | "Red Spot and Perceptive were Azure-first shops. I kept Azure requirements at ilumed. This has been my primary cloud for several roles." |
| **.NET Core** | **Direct match** | "Perceptive and Red Spot were .NET shops. I've been shipping production healthcare apps on .NET and Azure for years." |
| RCM-specific domain depth | Needs positioning | Use the A/R follow-up knowledge from your research. Speak in their terms: denial codes, appeal processes, payer rules, medical necessity. |

---

## Questions That Show Homework

1. "I saw the Cohere partnership launched in June — agentic AI handling 40% of A/R follow-up. How is that playing out in practice? What's working and what's harder than expected?"
2. "With Mendel's clinical NLP for the hardest denial appeals, how are you thinking about the handoff between administrative reasoning and clinical reasoning in the pipeline?"
3. "The JD mentions 'Administrative and Clinical Reasoning Models' — is the vision to have a single model that handles both, or separate specialized models that compose together?"
4. "What does observability look like for AI agents making autonomous decisions on claims? How do you know when model quality is drifting?"
5. "How does the Austin pod coordinate with the San Jose (Mendel) team day-to-day?"

---

## Signals to Watch

**Green flags:**
- They describe engineering as a first-class function, not a support org
- They talk about investment in engineering practices (testing, observability, debt management)
- Jesse describes a clear vision for where Orchestration Works is headed
- Dragon seems engaged and excited about the problems they're solving

**Yellow flags:**
- Vague answers about tech stack or architecture — could mean it's not decided yet (opportunity) or not prioritized (risk)
- Heavy emphasis on speed without mention of quality or testing
- Unclear reporting structure between the two VPs (Grose and Estum)

**Red flags:**
- Dragon seems burned out or disengaged
- They can't articulate what success looks like for the first 6 months
- Pressure to ship without engineering standards ("we'll add tests later")
- Dismissive about security or compliance ("the compliance team handles that")
