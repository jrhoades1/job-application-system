# Company Brief — Ensemble Health Partners

**Researched:** 2026-03-04
**Role:** Director, Software Engineering (Orchestration Works)
**Sources:** ensemblehp.com, Glassdoor, KLAS, Databricks case study, GlobeNewsWire, Cohere partnership announcement, interview transcripts R1+R2

---

## Company Overview

**What they do:** Technology-enabled revenue cycle management (RCM) outsourcing for health systems. They embed inside hospitals and run the entire financial back office: patient registration, insurance verification, coding, billing, claims submission, denial management, A/R follow-up, and payment posting.

**Revenue model:** Percentage of client's collected revenue — if the hospital makes more money, Ensemble makes more money. This is their key differentiator vs competitors who charge flat fees.

**Scale:**
- 28 health systems nationwide
- $40 billion in annual net patient revenue managed
- 400+ hospital system integrations via EIQ platform
- $100M+ invested in technology over the past decade
- 2M+ development hours on EIQ
- 10 U.S. patents

**Headquarters:** Cincinnati, OH (corporate) | Austin, TX (Orchestration Works) | San Jose, CA (Mendel AI lab)

**Ownership:** Private. PE-backed (Golden Gate Capital). Stock option equivalent offered to key hires, suggesting planned liquidity event.

**CEO:** Judson Ivy — Founder, 20+ years healthcare experience

**CTO:** Grant Veazey — 20+ years healthcare tech, former CIO of Optum360, former VP of Enterprise Engineering at UnitedHealth Group. Leads technology strategy, EIQ, client data security, and IT infrastructure. Called the pod leader role "the most important role in engineering."

---

## Leadership Team (Key People)

| Name | Title | Background |
|------|-------|------------|
| Judson Ivy | Founder + CEO | 20+ years healthcare; driving Orchestration Works urgency |
| Grant Veazey | CTO | Former CIO Optum360, VP UnitedHealth Group; owns EIQ strategy |
| Shannon White | COO | 25+ years operational RCM experience |
| Andrew Ray | Chief Product + Innovation Officer | Former McKinsey; healthcare provider transformation |
| Matthew Grose | VP of Software Engineering | Hiring manager; interim pod leader for A/R follow-up team |
| Jesse Estum | VP of Software Engineering | Interviewing Round 3; likely leads parallel pod cluster |
| Dragon Sky | Software Engineer | Interviewing Round 3; senior IC, technical depth check |
| Bethany Tacoronte | Recruiter | IT department recruiter; your ally in the process |

---

## EIQ Platform — The Technology Moat

EIQ is Ensemble's patented, proprietary revenue cycle intelligence engine.

**Data Scale:**
- 2,000+ terabytes of harmonized claims data
- 100+ million annual claims transactions
- 80,000+ denial audit letters reviewed
- 10,000+ payer policies tracked
- 100+ revenue metrics monitored

**Architecture:**
- **Cloud:** Microsoft Azure (primary)
- **Data platform:** Databricks lakehouse architecture — unified data across environments with single source of truth
- **AI/ML:** Azure OpenAI Service + Mendel clinical NLP + Cohere agentic AI
- **Languages:** JavaScript/TypeScript, .NET Core (C#)
- **Integration:** HL7 v2, FHIR R4, EDI 837/835 (X12), direct EHR connections
- **Observability:** Mentioned in JD as requirement; likely Azure Monitor / Application Insights

**Key Capabilities:**
- Automation engine with patent-pending "Note Wizard Automation"
- Intelligent data exchange technology
- Predictive denial prevention through risk modeling
- Automated payment anomaly detection on every account
- Personalized patient communication based on behavior/preferences
- Conversational AI for HIPAA-compliant payer and patient interactions
- Generative AI denial appeal drafting with clinical oversight
- Autonomous agents managing A/R follow-up

**HITRUST r2 certified** — highest level of information protection assurance

**Impact Metrics:**
- $80M in prevented revenue loss annually
- 50% reduction in abandoned call rates
- 40% faster denial appeal submissions
- 92% prior authorization completion rate with zero manual interventions
- 23% increased revenue per operator action
- Up to 60% productivity improvement from Note Wizard

---

## Orchestration Works — The Division You'd Join

**What it is:** Brand-new R&D division, independent team with startup speed inside enterprise.

**Size:** 50-person target, headquartered in Austin, TX

**Structure:**
- Organized as "pods" — cross-functional, autonomous teams aligned to business domains
- One pod in San Jose (Mendel-origin AI/NLP team)
- Two or three pods in Austin
- Your pod: A/R follow-up — ~4 teams, ~25 engineers
- 12-15 operations domain experts co-located with engineering in Austin

**Focus:** Revenue cycle innovations powered by automation, AI, and reimagined processes — including "Administrative and Clinical Reasoning Models"

**Philosophy:**
- Foundation is **deterministic** (rules-based, reliable)
- Enriched with **AI on top** (intelligence, flexibility)
- Initial focus: end-to-end automation without human touch (highest bar)
- Then: incremental human-in-the-loop and partial automation
- Work queues trigger automation — could be deterministic or AI-driven

---

## Mendel AI Acquisition (Summer 2025)

**What Mendel does:** Clinical NLP — extracts structured data from unstructured clinical text (physician notes, discharge summaries, pathology reports, radiology reads).

**Core technology:**
- Clinical Named Entity Recognition (NER)
- Medical knowledge graph integration (ICD, SNOMED, LOINC, RxNorm)
- "Hypercuration" — AI-assisted clinical data curation at regulatory/billing accuracy
- Real-world data (RWD) platform
- FHIR-compliant data pipelines

**Why it matters for A/R follow-up:** The hardest denial appeals require clinical evidence. Mendel's NLP can read physician notes and extract the clinical justification needed to overturn denials — automating the most labor-intensive, skill-intensive part of A/R.

---

## Cohere Partnership (June 2025)

**What it is:** First healthcare deployment of Cohere North — enterprise-grade agentic AI infrastructure for complex regulated environments.

**Key details:**
- Agentic AI agents deployed **horizontally** across the entire revenue cycle (not just point solutions)
- Initial focus: **Insurance Reimbursement Management** — expected to handle 40%+ of A/R follow-up tasks that previously required humans
- Pilot phase: Authorization Management, Utilization Management, Coding and Denial Prevention
- Human-in-the-loop validation system for agent actions
- Trained on 10+ years of Ensemble performance data

**Results already delivered:**
- 40% faster denial appeals
- 15% better denial overturn rates
- 35% faster patient call resolution

---

## Solventum Partnership (May 2025)

First-of-its-kind autonomous coding solution at scale across all medical specialties, including inpatient services. Combines Solventum's AI coding with Ensemble's operational scale and denial intelligence.

---

## Microsoft Partnership (April 2024)

Expanded partnership to accelerate Azure-based AI capabilities within EIQ. Azure generative AI and ML powering automation across the revenue cycle.

---

## Competitive Landscape

| Competitor | Differentiator vs Ensemble |
|------------|--------------------------|
| R1 RCM (Accenture) | Scale + consulting, but generic approach |
| Optum (UnitedHealth) | Payer data advantage, but conflict of interest for providers |
| Conifer (Tenet) | Hospital-owned, but parent creates conflicts |
| Waystar | Claims tech platform, but not full-service outsourcing |
| AKASA | AI-native RCM automation, but no operational scale |

**Ensemble's moat:** Outcome-aligned pricing + 400+ EHR integrations + Best in KLAS + Mendel clinical NLP + Cohere agentic AI. No competitor has all five.

---

## Awards & Industry Recognition

- **Best in KLAS** — 5x winner (2020-2022, 2024-2025). KLAS = healthcare IT's independent satisfaction survey. Winning this repeatedly is a sales weapon — CIOs use KLAS as a procurement signal.
- **Black Book Research** Top RCM Outsourcing Solution 2021-2024
- **22 HFMA MAP Awards** for Revenue Cycle 2019-2024
- **Everest Group RCM PEAK Matrix** Leader 2024
- **Fortune Best Workplaces in Healthcare** 2024
- **Great Place to Work certified** 2023-2024

---

## Glassdoor / Culture

- **Rating:** ~3.0/5 (950 reviews) — mixed for the overall company
- **Positives:** Work-life balance, good benefits, collaborative culture, WFH flexibility, mission-driven
- **Concerns:** Compensation rated 2.5/5, heavy workload, some micromanagement complaints
- **Engineering-specific:** Orchestration Works is explicitly positioned as a startup-speed culture inside the enterprise — likely different from the broader company culture
- **Red flag to watch:** The gap between "startup speed R&D division" promise and PE-backed services company reality. Probe this in the interview.

---

## Connection Points to Your Background

| Their Need | Your Achievement | Numbers |
|-----------|-----------------|---------|
| **Azure cloud platform** | **Azure-first at Perceptive and Red Spot; Azure requirements at ilumed** | **Multiple production Azure deployments** |
| **.NET Core / C#** | **Perceptive and Red Spot were .NET shops; C# throughout career** | **Direct stack match** |
| Data integration with hospital EMRs | Built agnostic integration engine (Epic, Athena, 18+ connections, FHIR, HL7) at ilumed | 18+ EMR connections |
| A/R follow-up automation | Automated insurance verification at MedQuest | 60% error reduction, 500+ hours saved |
| Scaling data ingestion | Auto-scaling data processing for CMS/EMR feeds at ilumed (Azure) | 50K→90K beneficiaries |
| Building teams from scratch | Built teams 0→22 (MedQuest), 0→15 (Red Spot), 0→10 (Perceptive) | Three times |
| AI in healthcare operations | AI-driven risk stratification, analytics, claims optimization | 30% faster dev cycles, 18% cost reduction |
| Deterministic + AI hybrid | Rules-based workflows + AI enrichment at ilumed | Work lists + ML prioritization |
| Healthcare compliance | HIPAA, SOC2/HITRUST certification, 99.9% uptime at ilumed | 99.9% uptime |
| Translating technical to business | MBA + CTO experience bridging engineering and C-suite | Career trajectory |

---

## Red Flags & Unknowns

- **Glassdoor comp rating at 2.5/5** — the broader company has compensation concerns. Orchestration Works packages may be different (Bethany indicated "lucrative" packages).
- **Missing KLAS 2023** — the gap year is worth probing: category change or competitive year?
- **PE-backed urgency** — "CEO wants first 10 in 3 weeks" is aggressive. Fast hiring can mean rushed onboarding.
- **On-site 5 days** — in a market where most engineering talent expects hybrid. This limits the talent pool.
- **Two VPs of SE** — organizational dynamics between Grose and Estum unclear. Who has final authority?
