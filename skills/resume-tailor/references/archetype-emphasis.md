# Archetype → Bullet Emphasis Map

Tells the resume-tailor skill which bullet categories to lead with and which
keywords to prioritize for each of the 7 archetypes. Used only when
`metadata.archetype` is set to a non-general value (populated by
classify-on-write on insert).

Never delete a bullet in response to archetype. Only reorder.

## engineering-leadership

**Lead with:** team-scaling, org design, hiring, cross-functional leadership,
roadmap ownership, budget, P&L exposure.

**Tag: leadership, org-building, hiring, cross-functional, executive-presence**

**Keyword priority (top 3 in summary):**
- "scaled engineering org from X to Y"
- "managing managers" / "director-of-directors"
- "roadmap ownership" / "OKR" / "quarterly planning"

**Demote (move to later in role):** IC coding, specific frameworks, individual
feature delivery.

**Typical JD signals:** VP, SVP, Director of Engineering, Head of Engineering, CTO,
Engineering Manager, Sr. Manager.

## ai-applied

**Lead with:** LLM integration, RAG pipelines, prompt engineering, agentic
workflows, AI product launches, cost optimization of AI features.

**Tag: llm, rag, agentic, prompt-engineering, ai-product, evals**

**Keyword priority (top 3 in summary):**
- "LLM-powered" / "Claude" / "GPT" / "Anthropic"
- "RAG" / "retrieval-augmented generation" / "vector database"
- "agentic" / "autonomous agents"

**Demote:** Traditional ML (regression, tree-based models unless DL-adjacent),
infra not specific to AI (generic Kubernetes), non-AI product work.

**Typical JD signals:** AI Engineer, ML Engineer, Applied AI, LLM Engineer,
Founding AI Engineer.

## data-analytics

**Lead with:** data warehouse ownership (Snowflake, BigQuery, Redshift), dbt
modeling, pipeline scaling, analytics engineering, metric framework design.

**Tag: data-warehouse, dbt, etl, analytics, metrics-framework**

**Keyword priority (top 3 in summary):**
- "Snowflake" or "BigQuery" (whichever JD specifies)
- "dbt" / "analytics engineering"
- "data platform" / "warehouse architecture"

**Demote:** Generic software engineering, non-data infra.

**Typical JD signals:** Sr/Staff Data Engineer, Analytics Engineer, Head of
Data/Analytics/BI, Data Platform Lead.

## platform-sre

**Lead with:** infrastructure at scale, reliability (SLO/SLI), on-call ownership,
observability, incident response, cost optimization, developer experience.

**Tag: infrastructure, sre, reliability, observability, devex**

**Keyword priority (top 3 in summary):**
- Cloud provider the JD specifies (AWS, GCP, Azure)
- "Kubernetes" / "Terraform" / "IaC"
- "SLO" / "reliability" / "incident response"

**Demote:** Product-facing engineering, frontend work, business-logic features.

**Typical JD signals:** Sr/Staff/Principal Platform/Infrastructure/SRE/Site
Reliability/DevOps Engineer, Head of Platform/Infrastructure/SRE/DevEx.

## founder-minded-ic

**Lead with:** 0-to-1 builds, first-hire work, rapid prototyping, ambiguous
scope resolution, wearing multiple hats, early-stage ownership.

**Tag: 0-to-1, founding, early-stage, ambiguity, breadth**

**Keyword priority (top 3 in summary):**
- "founding" / "first engineer" / "0-to-1"
- Stage marker: "seed" / "Series A" / "early stage"
- Breadth marker: "full stack" / "end-to-end" / "cross-functional"

**Demote:** Deep specialization, long-tenure-at-big-co bullets, narrow scope
ownership.

**Typical JD signals:** Founding Engineer, Founding AI Engineer, First
Engineer, Early Engineer, 0-to-1 in the JD.

## security

**Lead with:** AppSec, threat modeling, vulnerability remediation, SOC 2 / ISO
27001 / HITRUST ownership, security engineering program building, incident
response.

**Tag: appsec, threat-modeling, compliance, vuln-management, incident-response**

**Keyword priority (top 3 in summary):**
- "OWASP" / "threat modeling" / "SAST/DAST"
- Compliance framework the JD names (SOC 2, ISO 27001, HITRUST)
- "security engineering" / "product security"

**Demote:** Non-security engineering work (unless adjacent, e.g., infra-as-security).

**Typical JD signals:** Sr/Staff/Principal Security/AppSec Engineer, Head of
Security/AppSec, CISO.

## healthcare-ops

**Lead with:** HIPAA / FHIR / HL7 compliance work, EHR/EMR integrations, PHI
handling, regulated-vendor oversight, CMS/FDA interactions, audit outcomes.

**Tag: hipaa, fhir, ehr, phi, compliance, regulated**

**Keyword priority (top 3 in summary):**
- Compliance framework: "HIPAA" / "HITRUST"
- Integration standard: "FHIR" / "HL7" / "EHR"
- "PHI" / "regulated environment"

**Demote:** Non-healthcare work (unless clearly transferable, e.g., fintech
regulated experience can be kept).

**Typical JD signals:** CTO / VP Engineering / Head of Engineering **at a
healthcare company** (the archetype requires HIPAA/PHI/FHIR keywords in the
JD on top of a leadership title).

## How the resume-tailor skill uses this

1. Read `metadata.archetype`. If unset or `"general"` → use base rubric.
2. Look up the archetype above. Read its "Lead with" and "Keyword priority" lines.
3. When reordering bullets within each experience role:
   - Bullets tagged with any of the archetype's **Tags** move to the top.
   - Ties broken by relevance to the specific JD requirements.
4. When writing the summary: weave in 2-3 of the archetype's **Keyword priority**
   terms, preferring ones that also appear in the JD.
5. Never delete any bullet, even "demoted" ones. They move lower in order. User
   may override.

## Adding a new archetype

If a new archetype appears in `packages/scoring-rules/archetypes.yaml`, add a
section here. Keep sections in the same order as the YAML for ease of review.
The classifier test fixtures in `tests/test_classify_archetype.py` and
`apps/web/tests/scoring/classify-archetype.test.ts` should also gain a
fixture for the new archetype.
