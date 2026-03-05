# Interview Prep — Ensemble Health Partners, Director of Software Engineering

**Interview date:** Thursday, March 5, 2026, 9:30am EST
**Duration:** 75 minutes
**Format:** Video call — screen sharing + diagram drawing (Excalidraw)
**Interviewers:** Dragon Sky (Software Engineer), Jesse Estum (VP of Software Engineering)
**Focus:** System design and engineering principles review

---

## Understanding Your Panel

### Jesse Estum — VP of Software Engineering
**What he's assessing:** Strategic thinking, leadership philosophy, architectural judgment, how you'd operate at the VP/Director interface. He's a peer to Matthew Grose — likely owns a different pod cluster or platform area. He wants to know: can I work with this person? Will they elevate the engineering org?

**Approach:** Lead with strategic framing before diving into details. Show you think about systems in terms of business outcomes, not just technical architecture. Reference the Cohere agentic AI work and Mendel acquisition — show you've done homework on where Ensemble is headed.

### Dragon Sky — Software Engineer
**What he's assessing:** Technical credibility, whether you understand engineering problems at a real level, how you'd work with ICs. Senior ICs on panels have effective veto power. He wants to know: will this person make my engineering life better or worse? Do they understand the actual problems?

**Approach:** Be genuine about what you own vs delegate. Show that you sit in design sessions, you think about failure modes, you care about developer experience. Don't pretend you write production code daily — but show you can reason about systems at the design level.

---

## Your Top 3 Talking Points

### 1. Data Integration at Healthcare Scale — On Their Exact Stack
**The story:** At ilumed, built an agnostic integration engine connecting to 18+ healthcare systems (Epic, Athena, CMS) via FHIR, HL7, and REST APIs. Handled bi-directional data flow — ingesting patient data AND pushing alerts/notes back to primary care physicians. Kept requirements in Azure. Before that, both Perceptive and Red Spot were Azure-first, .NET shops — so you've been building production healthcare systems on Azure and .NET for years.
**Numbers:** 18+ connections, supported 50K→90K beneficiary coverage (55% growth), 99.9% uptime
**Connection to role:** Ensemble's EIQ runs on Azure with .NET Core and TypeScript. Your integration engine experience is a direct 1:1 match — same cloud platform, same language ecosystem, same healthcare integration standards (FHIR, HL7). You've dealt with rate limiting, data normalization, and the politics of writing back to source systems. This isn't a learning curve — it's a homecoming.

### 2. Building Teams and Engineering Culture from Zero
**The story:** Built three separate engineering teams from inception — MedQuest (0→22 including QA, Product, offshore), Red Spot (0→15 with key offshore), Perceptive (0→10 in startup environment). First hires were always cultural — leads who help move things forward. Then processes (agile ceremonies). Then scale.
**Numbers:** 3 teams from zero, 22 + 15 + 10 = 47 total hires across career
**Connection to role:** Orchestration Works needs someone to take an existing team and scale it to ~25 across 4 sub-teams. You've done this exact motion multiple times. And you know the hiring sequence: culture first, process second, scale third.

### 3. Deterministic Foundation + AI Enrichment (Their Philosophy, Your Practice)
**The story:** At ilumed, built a 5-part system: (1) data ingestion, (2) risk stratification ML models, (3) work list generation, (4) interaction tracking across modalities, (5) reporting and feedback loops. The foundation was deterministic rules (work list assignment, quality gates), enriched with AI (risk scoring, prioritization). At Red Spot and Perceptive, integrated AI into .NET-based production systems — cutting dev cycles 30% and operational costs 18%.
**Numbers:** AI-driven optimizations expanded coverage 55%, operational costs reduced 18%, development cycles cut 30%
**Connection to role:** This IS Ensemble's stated architecture philosophy — "foundation is deterministic, enriched with AI." You've already built this pattern, on their preferred stack (Azure + .NET). For A/R follow-up: deterministic claim routing + AI-powered denial classification + ML-based recovery prediction.

---

## Stack Alignment — No Gaps

This is a strength, not a gap. Lean into it.

| Their Requirement | Your Direct Experience |
|---|---|
| **Azure (preferred cloud)** | Azure-first at Perceptive and Red Spot. Kept Azure requirements at ilumed. Years of production Azure experience in healthcare. |
| **.NET Core / C#** | Perceptive and Red Spot were .NET shops. C# has been a core language throughout your career. .NET Core is the modern evolution of the same framework you've shipped on. |
| **JavaScript/TypeScript** | NodeJS experience. TypeScript is typed JavaScript — same ecosystem. |
| **FHIR, HL7** | Built integration engine handling both at ilumed. 18+ EMR connections. |
| **CI/CD, automation** | Instituted DevOps/CI/CD at Red Spot — 50% deployment frequency improvement, 35% reliability gain. |
| **Observability** | Built reporting and monitoring across all 5 system layers at ilumed. |
| **AI-enabled development tools** | Active AI practitioner — building with coding agents daily. Token philosophy: "if you're not running out of tokens every day, you're not thinking big enough." |

**How to deploy this in conversation:** Don't wait for them to ask about your tech stack. Drop it naturally: "At Red Spot and Perceptive, we were Azure-first .NET shops, so I'm very familiar with this ecosystem. At ilumed, I kept our requirements in Azure as well."

---

## System Design Scenarios

### SCENARIO 1: End-to-End A/R Follow-Up Automation System
*This is the most likely system design question — it's the exact problem your pod would own.*

**The problem:** A hospital submits a claim. The payer (insurance) either doesn't pay, underpays, or denies the claim. Today, human operators manually check claim status, categorize denials, draft appeals, and follow up. Automate this end-to-end.

**Your design approach (draw this in Excalidraw):**

```
┌─────────────────────────────────────────────────────────────┐
│                    A/R FOLLOW-UP AUTOMATION                  │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────┐    │
│  │  Claims   │───▶│   Ingestion  │───▶│  Central Data   │    │
│  │  Source   │    │   Engine     │    │  Store (Lake-   │    │
│  │ (835/ERA)│    │ (FHIR/HL7/  │    │  house)         │    │
│  └──────────┘    │  EDI X12)    │    └───────┬────────┘    │
│                  └──────────────┘            │              │
│                                              ▼              │
│  ┌───────────────────────────────────────────────────┐      │
│  │           TRIAGE & CLASSIFICATION                  │      │
│  │  ┌─────────────┐  ┌──────────────┐               │      │
│  │  │ Deterministic│  │  ML Denial   │               │      │
│  │  │ Rules Engine │  │  Classifier  │               │      │
│  │  │ (known codes)│  │ (complex/new)│               │      │
│  │  └──────┬──────┘  └──────┬───────┘               │      │
│  │         └────────┬───────┘                        │      │
│  └──────────────────┼────────────────────────────────┘      │
│                     ▼                                       │
│  ┌───────────────────────────────────────────────────┐      │
│  │              ACTION ORCHESTRATOR                   │      │
│  │                                                    │      │
│  │  Route 1: Auto-Resolve (simple rebilling)         │      │
│  │  Route 2: AI Appeal (Mendel NLP + clinical docs)  │      │
│  │  Route 3: Payer Contact (automated status check)  │      │
│  │  Route 4: Human Escalation (complex/high-value)   │      │
│  └───────────────────┬───────────────────────────────┘      │
│                      ▼                                      │
│  ┌───────────────────────────────────────────────────┐      │
│  │           AI APPEAL ENGINE (for Route 2)          │      │
│  │                                                    │      │
│  │  1. Retrieve clinical docs from EHR               │      │
│  │  2. Mendel NLP extracts clinical evidence          │      │
│  │  3. Map evidence to denial reason code             │      │
│  │  4. Generate appeal letter (GenAI + templates)     │      │
│  │  5. Human review gate (confidence threshold)       │      │
│  │  6. Submit to payer                                │      │
│  └───────────────────┬───────────────────────────────┘      │
│                      ▼                                      │
│  ┌───────────────────────────────────────────────────┐      │
│  │        MONITORING & FEEDBACK LOOP                  │      │
│  │                                                    │      │
│  │  - Track resolution rates by category              │      │
│  │  - Measure automation coverage %                   │      │
│  │  - Flag confidence drift in ML models              │      │
│  │  - Feed outcomes back to train classifiers          │      │
│  │  - Dashboard for ops + engineering                  │      │
│  └───────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**Key design decisions to discuss:**

1. **Deterministic first, AI second:** Simple denial codes (e.g., duplicate claim, timely filing) get rules-based resolution. Complex denials (medical necessity, clinical documentation) get AI. This matches Ensemble's stated philosophy.

2. **Human-in-the-loop with confidence thresholds:** AI-generated appeals above 95% confidence auto-submit. Below that, human reviews. The threshold adjusts as the model proves itself — start conservative, earn trust.

3. **Observability for AI agents:** Every autonomous decision logged with: input data, model version, confidence score, action taken, outcome. This is non-negotiable in healthcare. Azure Monitor + Application Insights provide the infrastructure for this.

4. **Feedback loop:** Every resolution outcome (paid, denied again, partial) feeds back into the ML classifier. The system gets smarter over time.

5. **Scaling:** Work queues are the unit of parallelism. Each queue item is independent. Scale horizontally by adding workers. Azure Service Bus or Event Grid for queue management. Auto-scale based on queue depth — same pattern you used at ilumed, now on Azure natively.

6. **Security:** PHI handled with HIPAA controls at every layer. HITRUST r2 compliance. No PHI in logs. Encryption at rest and in transit. Azure Key Vault for secrets management. Audit trail on every AI decision.

**Talking points while drawing:**
- "I'd start by understanding the data flow — where do denied claims come from, what format, what systems?"
- "The triage layer is where the deterministic/AI split happens — this is the most important architectural decision"
- "For the AI appeal engine, the Mendel NLP capability is the differentiator — competitors can't read clinical docs to justify appeals"
- "On Azure, I'd use Service Bus for the work queues, Azure OpenAI for the generative components, and Application Insights for the observability layer — I've worked this stack before"
- "Monitoring AI agents in healthcare is different from monitoring traditional services — you need to track decision quality, not just uptime"

---

### SCENARIO 2: Healthcare Data Integration Platform
*If they go more foundational — how would you design the data ingestion layer?*

**Components to draw:**

```
Hospital Systems          Integration Layer          Central Store
┌──────────┐           ┌─────────────────┐        ┌──────────┐
│ Epic     │──FHIR───▶│                 │        │          │
│ Athena   │──HL7────▶│  Adapter Layer  │───ETL─▶│ Lakehouse│
│ Cerner   │──API────▶│  (protocol-     │        │ (Databricks│
│ CMS      │──Batch──▶│   agnostic)     │        │  Delta/   │
│ Clearing │──EDI────▶│                 │        │  Parquet) │
│  houses  │          └────────┬────────┘        └────┬─────┘
└──────────┘                   │                      │
                               ▼                      ▼
                    ┌─────────────────┐     ┌────────────────┐
                    │ Rate Limiting   │     │ Denormalized   │
                    │ & Governance    │     │ Views (for     │
                    │ (per-source     │     │ work lists &   │
                    │  throttling)    │     │ real-time ops) │
                    └─────────────────┘     └────────────────┘
```

**Key principles:**
- **Protocol-agnostic adapter pattern:** Each source gets an adapter. New source = new adapter, not new pipeline. At ilumed, we built exactly this pattern for 18+ EMR connections.
- **Rate limiting is per-source:** Epic has different limits than CMS. Governors prevent shutoffs. "They would shut you off if you pulled too hard — I learned this the hard way."
- **Bi-directional:** Read ingestion AND write-back (alerts, notes, status updates to source EHRs). At ilumed, we pushed alerts back to PCPs when patients had hospital visits.
- **Idempotency:** Every message processed exactly once. Healthcare data can't have duplicates.
- **Schema evolution:** Hospital systems change their data formats without warning. Adapters must handle versioning.
- **Auto-scaling on Azure:** Scale compute for nightly batch loads, scale back during quiet hours. Azure Functions or AKS with auto-scaling policies — same pattern you used at ilumed, now using native Azure services.

---

### SCENARIO 3: AI Agent Orchestration Architecture
*If they ask about the agentic AI layer specifically — how would you architect AI agents for RCM?*

**Key components:**
1. **Agent Registry** — catalog of available agents (denial classifier, appeal writer, status checker, patient communicator)
2. **Orchestrator** — routes work items to the right agent or sequence of agents. Azure Durable Functions or custom orchestration on .NET Core.
3. **Context Builder** — assembles all relevant data (claim, clinical docs, payer history, prior attempts) before agent execution
4. **Guardrails Layer** — confidence thresholds, compliance checks, PHI boundaries, cost limits
5. **Human Escalation Queue** — when agents can't resolve or confidence is low
6. **Outcome Tracker** — logs every agent decision and outcome for training and audit

**Design principles to emphasize:**
- "Agents should be composable — the denial classification agent feeds into the appeal writing agent"
- "Every agent has a defined input schema, output schema, and confidence metric"
- "Guardrails are infrastructure, not afterthoughts — they're in the orchestration layer, not in each agent"
- "Start with high-confidence, low-risk automation (claim status checks) and expand to higher-risk actions (appeal submission) as trust builds"
- "This maps to the Cohere North architecture you've deployed — horizontal orchestration across the full revenue cycle, not vertical point solutions"

---

## Engineering Principles to Demonstrate

These align with what Ensemble values based on the JD and interviews:

1. **Security is non-negotiable.** "If you have to choose between security and speed, you choose security." (You said this in Round 2 — repeat it. It resonated.)

2. **Deterministic foundation, AI enrichment.** "Start with reliable, predictable rules. Add AI where it creates value the rules can't capture."

3. **Observability over assumptions.** "In healthcare, you can't just hope the AI is making good decisions. Every decision must be logged, measured, and auditable."

4. **Test-driven quality gates.** "A requirement isn't done until you can say how to test it. This applies to AI features too — what does a correct denial classification look like?"

5. **Define what success means first.** "Before we build anything, what does the business need? Getting a list to zero isn't the same as getting it to zero accurately." (Your Round 2 point — reinforce it.)

6. **Trust but verify, automated.** "CI/CD with security checks, secrets scanning, automated tests — these are non-negotiable gates. They're infrastructure, not overhead."

---

## Likely Questions & Answers

### System Design Questions
**Q: "Design a system to automate A/R follow-up for denied claims."**
→ Use Scenario 1 above. Start with clarifying questions: "What types of denials? What's the current volume? What's the current automation coverage?" Then draw the architecture.

**Q: "How would you approach scaling data ingestion from hundreds of hospital systems?"**
→ Use Scenario 2. Emphasize adapter pattern, rate limiting, auto-scaling. Reference your ilumed experience directly — "I've built this exact system."

**Q: "How would you architect AI agents that make autonomous decisions on healthcare claims?"**
→ Use Scenario 3. Lead with guardrails and observability. Emphasize confidence thresholds and human escalation.

**Q: "What's your experience with Azure?" or "Tell me about your .NET experience."**
→ "Red Spot and Perceptive were both Azure-first .NET shops — that was our production stack for healthcare applications. At ilumed I kept our requirements in Azure as well. So Azure and .NET have been my primary stack for the last several roles. I've built CI/CD pipelines, auto-scaling infrastructure, and production healthcare apps on this platform."

### Engineering Principles Questions
**Q: "How do you balance speed of delivery with quality in a healthcare context?"**
→ "Security first, always. Then: deterministic foundation before AI. Testing as a first-class citizen — requirements aren't done until test cases exist. CI/CD with automated quality gates. The guardrails let the team go fast because they catch mistakes before they reach production."

**Q: "How do you approach technical debt?"**
→ "I prioritize it like everything else — by business impact. If technical debt is slowing down feature delivery or creating reliability risk, it goes on the roadmap. I don't let it accumulate silently. We track it, size it, and schedule it alongside feature work."

**Q: "Tell me about a time a system you designed failed. What happened?"**
→ Use the data ingestion scaling challenge at ilumed: "Our normalized data model couldn't keep up with query performance as we scaled. We had to denormalize specific views for work lists. The lesson: design for the access patterns your operations team actually needs, not the theoretically clean data model."

### Leadership Questions
**Q: "How would you work with the operations domain experts co-located in Austin?"**
→ "They're the most important people in the room — they know the actual process, the edge cases, the workarounds, the payer quirks. My job is to translate their domain knowledge into systems. I'd embed them in the pod structure, have them in sprint planning, and make sure every feature we build maps to a real operational pain point they've identified."

**Q: "How do you manage a team of engineers you're building from scratch?"**
→ "Cultural hires first — the leads who set the tone. Then establish processes — agile ceremonies, code review standards, testing practices. Then scale. I've done this three times. The sequence matters."

**Q: "How do you hold teams accountable?"**
→ "Weekly one-on-ones, individualized plans, trust but verify. The CI/CD pipeline handles the mechanical verification — tests, security, quality gates. The human side is about removing blockers and having honest conversations about what's working and what's not. It should be fun."

---

## Questions to Ask Them

### For Jesse Estum (VP)
1. "How does the A/R follow-up pod coordinate with the Mendel team in San Jose on clinical reasoning models?"
2. "What's the biggest technical risk you see in the Orchestration Works roadmap right now?"
3. "How do you measure success for the pod leader role — what does a great first 6 months look like?"
4. "How does the engineering org balance the innovation mandate of Orchestration Works with the operational reliability that maintains Best in KLAS?"

### For Dragon Sky (SE)
1. "What's the most interesting technical challenge you're working on right now?"
2. "What's the current architecture of the A/R automation pipeline — event-driven, queue-based, or something else?"
3. "What does the development workflow look like day-to-day — PRs, code review, deployment cadence?"
4. "What would you want from a new pod leader that you're not getting today?"

---

## Numbers Cheat Sheet

| Metric | Number | Context |
|--------|--------|---------|
| EMR integrations | 18+ | ilumed — Epic, Athena, CMS, FHIR, HL7 (on Azure) |
| Beneficiary growth | 50K → 90K (55%) | ilumed — AI-driven, Azure infrastructure |
| System uptime | 99.9% | ilumed — during 55% growth |
| Insurance automation | 60% error reduction | MedQuest — 500+ hrs/yr saved |
| Teams from zero | 3 (22, 15, 10) | MedQuest, Red Spot, Perceptive |
| Dev cycle improvement | 30% | Perceptive — AI integration, Azure/.NET shop |
| Deployment frequency | +50% | Red Spot — CI/CD, Azure/.NET shop |
| Revenue from scheduling | +40% | Red Spot — 200K+ appointments, Azure platform |
| Op cost reduction | 18% | Red Spot — AI analytics |
| Centers managed | 100 in 13 states | MedQuest — enterprise scale |
| Global team managed | 50+ developers | Cognizant — US, Ukraine, Central America |
| Org scaling | 4 → 25 engineers | ilumed — company grew 140→200 |

---

## Pre-Interview Checklist

- [ ] Open **excalidraw.com** in a browser tab
- [ ] Practice drawing Scenario 1 (A/R automation) in Excalidraw — aim for 5 min sketch
- [ ] Camera on, computer charged
- [ ] This prep doc + study sheet visible on second screen
- [ ] Have a glass of water nearby
- [ ] Review the [company-brief.md](company-brief.md) Cohere partnership details (40% of A/R automated, 40% faster appeals)
- [ ] Remember: start every system design with clarifying questions, then draw
- [ ] Close email/Slack/notifications — full focus

---

## Final Mindset

You are not hoping to get this job. You are evaluating whether this is the right place for your next chapter. You've built healthcare data platforms on Azure and .NET, scaled teams from zero, integrated AI into production systems, and bridged the gap between engineering and business. Their preferred stack is your stack. Their architecture pattern is your pattern. They need exactly what you've done. Go show them.
