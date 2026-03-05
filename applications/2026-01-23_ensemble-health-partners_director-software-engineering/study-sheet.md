# Study Sheet — Ensemble Health Partners
## Director, Software Engineering | Round 3: System Design Panel
### Review this in 10 minutes before the call

---

## The Company in 30 Seconds

"Ensemble Health Partners is a technology-enabled RCM outsourcer managing $40 billion in patient revenue across 28 health systems. Their revenue model is outcome-aligned — they earn a percentage of what they collect for hospitals, so every automation improvement directly drives Ensemble's revenue. They just launched Orchestration Works, a 50-person R&D division in Austin building AI-powered automation for the revenue cycle, backed by their acquisition of Mendel AI and a partnership with Cohere for agentic AI."

---

## Key People

| Who | Title | One Thing to Remember |
|-----|-------|-----------------------|
| Judson Ivy | CEO | Founded the company, driving urgency on Orchestration Works |
| Grant Veazey | CTO | Former CIO of Optum360; called pod leader "most important role in engineering" |
| Matthew Grose | VP of SE | Your hiring manager; currently interim pod leader for A/R team |
| **Jesse Estum** | **VP of SE** | **Tomorrow's interviewer — peer VP, assessing strategy + leadership fit** |
| **Dragon Sky** | **Software Engineer** | **Tomorrow's interviewer — senior IC, assessing technical depth + how you work with engineers** |
| Bethany Tacoronte | Recruiter | Your ally; reach out with any questions |

---

## Their Big Moves (Last 12 Months)

1. **Cohere partnership (June 2025)** — First healthcare deployment of agentic AI platform; handling 40%+ of A/R follow-up autonomously; 40% faster denial appeals
2. **Mendel AI acquisition (Summer 2025)** — Clinical NLP that reads physician notes to extract billing justification; now their San Jose AI lab
3. **Solventum partnership (May 2025)** — First autonomous inpatient coding solution at scale
4. **Microsoft Azure expansion (2024)** — Azure generative AI powering EIQ platform

---

## What They Need From This Hire

1. **A/R follow-up automation leader** — own the pod that automates end-to-end accounts receivable follow-up
2. **Bridge builder** — translate between engineering teams and C-suite/operations stakeholders
3. **Team builder** — scale from current team to ~4 teams, ~25 engineers with strong engineering culture

---

## Your Top 3 Bridges

| Their Need | Your Achievement | Number |
|-----------|-----------------|--------|
| Data integration with hospital EMRs (FHIR, HL7) | Built agnostic integration engine at ilumed — Epic, Athena, 18+ connections, bi-directional | 18+ connections |
| Scaling healthcare operations with AI | Expanded beneficiary coverage 50K→90K via AI risk stratification while maintaining 99.9% uptime | 55% growth |
| Building engineering teams from zero | Built 3 teams from scratch: MedQuest (0→22), Red Spot (0→15), Perceptive (0→10) | 3x from zero |

---

## Smart Things to Say

- "The Cohere partnership for agentic AI across the full revenue cycle — horizontal orchestration instead of point solutions — is exactly the architectural approach that scales."
- "With Mendel's clinical NLP, you can now close the loop on the hardest denial appeals: the ones that need clinical evidence from physician notes, not just administrative rebilling."
- "Your outcome-aligned revenue model means every automation improvement compounds — you're not just saving labor, you're increasing your revenue share."
- "Building on a deterministic foundation and enriching with AI is the right approach for healthcare — you need reliability first, intelligence second."

---

## Smart Things to Ask

1. "How does the A/R follow-up pod coordinate with the Mendel team in San Jose on clinical reasoning models?"
2. "What's the current ratio of deterministic automation vs AI-driven automation in the A/R pipeline?"
3. "How do you measure success for Orchestration Works — is it operator efficiency, revenue recovered, or automation coverage percentage?"
4. "What does the observability and monitoring story look like for AI agents making autonomous decisions on claims?"

---

## Numbers to Have Ready

| Metric | Number | Context |
|--------|--------|---------|
| EMR integrations built | 18+ | ilumed — Epic, Athena, CMS, FHIR, HL7 |
| Beneficiary coverage growth | 50K → 90K (55%) | ilumed — AI-driven with 99.9% uptime |
| Insurance verification automation | 60% error reduction | MedQuest — 500+ staff hours saved/year |
| Teams built from zero | 3 (22, 15, 10) | MedQuest, Red Spot, Perceptive |
| Dev cycle improvement | 30% faster | Perceptive — AI integration |
| Deployment frequency | 50% improvement | Red Spot — CI/CD |
| Scheduling platform revenue | 40% increase | Red Spot — 200K+ appointments |
| Operational cost reduction | 18% | Red Spot — AI-driven analytics |
| Diagnostic centers managed | 100 centers, 13 states | MedQuest — enterprise scale |

---

## Tech Stack — Direct Match (NOT a Gap)

| Their Stack | Your Experience |
|-------------|----------------|
| **Azure (preferred)** | **Azure-first at Perceptive and Red Spot. Azure requirements at ilumed. This is your primary cloud.** |
| **.NET Core / C#** | **Perceptive and Red Spot were .NET shops. C# throughout career. Direct match.** |
| TypeScript/JavaScript | NodeJS experience. TypeScript = typed JS. |
| FHIR, HL7 | Built integration engine handling both at ilumed |
| Databricks lakehouse | Data ingestion + denormalization experience at ilumed |
| Agentic AI / LLMs | Active AI practitioner — building with coding agents daily |

---

## Before You Log On

- [ ] Open **Excalidraw** (excalidraw.com) in a tab — you'll need it for system design diagrams
- [ ] Camera on, computer charged
- [ ] Have this study sheet visible on a second screen
- [ ] Review the A/R follow-up system design scenario (interview-prep.md)
- [ ] Remember: Jesse = strategic/leadership, Dragon = technical depth
