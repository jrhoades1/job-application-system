# AI-Era Engineering Interview Rubric

> Back-pocket reference for MEDVA presentation if hiring philosophy comes up.

## What We're Hiring For Now

The job is **specification, review, and integration** - not line-by-line code production. AI writes 70-80% of the code. Engineers own 100% of the quality, architecture, and judgment.

---

## Evaluation Framework (All Roles)

| Skill | What It Means | How We Test It |
|-------|--------------|----------------|
| **Decomposition** | Break a vague requirement into discrete, well-scoped units of work | Give a product brief ("add tenant-scoped messaging with E2E encryption"). Candidate produces a task breakdown, identifies unknowns, sequences dependencies. No code. |
| **Code Review & Judgment** | Spot bugs, security holes, and design flaws in generated code | Hand them a realistic AI-generated PR (3-4 files, 200-300 lines). Include 2-3 subtle issues: a missing RLS filter, a race condition, an over-permissive CORS config. See what they catch and how they reason about severity. |
| **Architecture Reasoning** | Make trade-off decisions AI can't | System design discussion. "We need real-time messaging for 5,000 concurrent users. Walk me through your approach." Evaluate: do they ask clarifying questions? Do they reason about trade-offs or just recite a pattern? |
| **Integration & Debugging** | Diagnose problems across boundaries | Give them a failing integration scenario: "This Lambda processes S3 uploads but embeddings aren't appearing in OpenSearch. Here are the CloudWatch logs." See how they investigate. Systematic vs. random. |
| **Spec Writing** | Produce specs clear enough that AI (or a junior dev) can execute | Give them a feature and 30 minutes. Evaluate: are edge cases covered? Is the scope bounded? Would you hand this to an AI agent and trust the output? |

---

## Role-Specific Focus

### DevOps & Security (US)

- **Primary:** Architecture Reasoning + Integration & Debugging
- **Scenario:** "Design the IAM policy structure for a multi-tenant HIPAA app where devs have zero prod access but need to debug production issues. Walk me through how an engineer investigates a production bug without touching the database directly."
- **Take-home:** Terraform module for a VPC with private subnets, NAT, and security groups. Evaluate IaC quality, not whether they memorized CIDR blocks.

### Lead Backend (Offshore)

- **Primary:** Code Review + Decomposition
- **Exercise:** Hand them an AI-generated NestJS module implementing tenant-scoped CRUD with RBAC guards. Include: one missing org_id check, one guard that checks role but not resource ownership, one N+1 query. 45 minutes to review and present findings.
- **Follow-up:** "How would you spec the fix for the most critical issue you found?" Tests whether they can direct the fix, not just identify the problem.

### Full-Stack (Offshore)

- **Primary:** Decomposition + Spec Writing
- **Exercise:** "Here's a Figma mockup of the Client KPI dashboard. Write the implementation spec - components, data fetching strategy, state management, error states. Assume AI will generate the code from your spec."
- **Evaluate:** Did they think about loading states? Empty states? What happens when the API is slow? Responsive behavior? This tests product-aware engineering.

### UI/UX (Offshore)

- **Primary:** Code Review + Integration
- **Exercise:** AI-generated dashboard component. "This renders correctly but has accessibility issues, doesn't handle loading/error states, and the responsive behavior breaks below 768px. Fix the spec, not the code."
- **Portfolio:** Still valuable. But ask "walk me through a decision you made that the design team pushed back on" - tests judgment under constraint.

---

## What We Stopped Testing (And Why)

| Old Test | Why It's Gone |
|----------|--------------|
| Live whiteboard coding | Tests syntax recall and typing under pressure. AI handles this. |
| Algorithm puzzles | Measures CS trivia. Doesn't predict ability to ship product. |
| "Build X from scratch in 60 min" | The job is never "build from scratch with no tools." It's "build correctly with every tool available." |
| Language-specific trick questions | AI knows every language quirk. We need people who know when the quirk matters. |

## What We Still Test

| Test | Why It Stays |
|------|-------------|
| System design | AI can't make trade-off decisions for your team, product, and constraints. |
| Code review | The highest-leverage skill. One missed RLS check = HIPAA violation. |
| Communication (especially offshore) | AI doesn't fix ambiguity between people. Miscommunication is still the #1 failure mode on distributed teams. |
| References | Do they ship? Do they own problems? No interview exercise tests this reliably. |

---

## Scoring

Each area: **Strong / Acceptable / Weak / Disqualifying**

Hire threshold: No "Weak" in primary focus areas. No "Disqualifying" anywhere. At least one "Strong."

For the Lead Backend and DevOps roles: Code Review must be "Strong." These two people are the quality gate for everything AI generates.

---

## The Short Version

> "We're not hiring people to write code anymore - we're hiring people to judge code, architect systems, and spec work clearly enough that AI or junior engineers can execute. The interview process reflects that. Live coding is out. Code review, system design, and spec writing are in."
