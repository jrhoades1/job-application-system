# MEDVA Pulse Portal -- Technical & Organizational Proposal
## Jimmy Rhoades | April 2026

---

# SECTION 1: TECHNOLOGY STACK RECOMMENDATION

## Frontend

| Choice | Why |
|--------|-----|
| **Next.js 15 (React 19)** | Server-side rendering for fast initial loads, API routes co-located with UI, massive hiring pool. React is the most widely adopted frontend framework -- finding offshore talent fluent in React is significantly easier than Vue or Angular. |
| **TypeScript (strict mode)** | Non-negotiable for a multi-tenant HIPAA app. Catches entire categories of bugs at compile time. Every file, no exceptions. |
| **Tailwind CSS + shadcn/ui** | Utility-first styling with accessible, composable components. Fast to build, consistent look, easy for offshore devs to maintain without diverging from design system. |

**Trade-off:** Next.js adds complexity vs. a plain React SPA, but we need SSR for SEO on client-facing pages and the API route co-location cuts infrastructure cost. The alternative (separate frontend + backend repos) doubles deployment complexity for a 5-person team.

## Backend

| Choice | Why |
|--------|-----|
| **Node.js / TypeScript (same language as frontend)** | One language across the stack = any engineer can work anywhere. Critical with a 5-person team. Eliminates context-switching cost and hiring fragmentation. |
| **NestJS framework** | Enterprise-grade structure (modules, guards, interceptors) without the overhead of Java/Spring. Built-in support for role-based guards, request validation, and OpenAPI docs. Opinionated enough to keep offshore devs consistent, flexible enough to not paint us into a corner. |
| **Modular monolith (not microservices)** | At team size of 5, microservices would drown us in infrastructure. We design clean domain boundaries (auth, billing, messaging, AI) as modules within a single deployable. When we hit 15+ engineers and need independent scaling, we extract. This is the pragmatic path -- I've made this exact call at Red Spot and Cognizant. |

**Trade-off:** Python would give us richer ML/AI libraries natively, but 90% of this platform is CRUD + role-based access + real-time messaging. Node/TS is the right tool for the dominant workload. For AI/ML specifically, AWS Bedrock handles the heavy lifting -- we're calling APIs, not training models.

**Why not Java/C#/.NET?** Heavier frameworks with longer iteration cycles. For a team of 5 building from scratch, developer velocity matters more than enterprise ceremony. TypeScript gives us type safety without the overhead.

## Database

| Choice | Why |
|--------|-----|
| **PostgreSQL (Amazon RDS)** | Industry standard for relational data. Row-level security (RLS) for multi-tenant data isolation -- critical for HIPAA. JSONB columns for flexible metadata without needing a separate NoSQL store for most cases. I've run Postgres at scale across three companies. |
| **Amazon DynamoDB** | High-volume event data only: VA activity logs, time-tracking events, chat message delivery receipts. Sub-millisecond reads at scale, zero operational overhead. |
| **Amazon ElastiCache (Redis)** | Session management, caching, real-time presence for messaging. |

**Multi-tenancy strategy:** Shared database, tenant isolation via `organization_id` on every table with RLS policies enforced at the database level. Not separate databases per tenant -- at 1,000+ clients, that's unmanageable. RLS gives us the isolation guarantees without the operational nightmare.

**Trade-off:** Separate databases per tenant would give stronger isolation but is operationally impractical at our scale. RLS + application-level checks + audit logging provides equivalent HIPAA-grade isolation with manageable complexity.

## Infrastructure & Cloud (AWS)

| Service | Purpose |
|---------|---------|
| **ECS Fargate** | Container orchestration without managing EC2 instances. Auto-scaling, HIPAA-eligible. |
| **Amazon RDS (PostgreSQL)** | Managed database with automated backups, encryption at rest, Multi-AZ failover. |
| **Amazon S3** | Document storage (KB files for AI chatbot, pay stubs, training materials). Server-side encryption, versioning, lifecycle policies. |
| **Amazon CloudFront** | CDN for static assets and frontend delivery. |
| **AWS WAF** | Web application firewall -- OWASP top 10 protection out of the box. |
| **AWS KMS** | Key management for encryption at rest and in transit. |
| **Amazon SES** | Transactional email (notifications, billing receipts, password resets). |
| **AWS Bedrock** | AI/ML runtime for KB chatbot (V1). No model hosting, no GPU management. Pay-per-inference. |
| **Amazon OpenSearch** | Document search across KB files for AI ingestion pipeline. |

**Why Fargate over EKS?** Kubernetes is overkill for a team of 5. Fargate gives us containerized deployments without the cluster management tax. We can migrate to EKS if/when team and service count justify it.

## CI/CD & Tooling

| Tool | Purpose |
|------|---------|
| **GitHub** | Source control, code review, issue tracking. Single source of truth. |
| **GitHub Actions** | CI/CD pipelines. Build, test, deploy on every PR merge. No Jenkins to maintain. |
| **Terraform** | Infrastructure as code. Every AWS resource is version-controlled and reproducible. |
| **Docker** | Containerized builds for consistent dev/staging/prod environments. |

## Monitoring & Observability

| Tool | Purpose |
|------|---------|
| **Amazon CloudWatch** | Infrastructure metrics, log aggregation, alerting. Native AWS integration. |
| **AWS X-Ray** | Distributed tracing for request flows across services. |
| **Sentry** | Application error tracking with stack traces, breadcrumbs, release tracking. |
| **PagerDuty** | On-call alerting and incident management. |

## HIPAA/SOC 2 Influence on Stack Decisions

Every choice above was filtered through compliance:

- **Encryption:** All data encrypted at rest (KMS) and in transit (TLS 1.2+). No exceptions.
- **Audit logging:** Every data access, modification, and deletion is logged with user ID, timestamp, and action. CloudWatch + custom audit tables.
- **Access control:** Zero direct database access in production. All changes go through application layer with RBAC. Developer production access = zero.
- **BAA coverage:** Every AWS service listed above is HIPAA-eligible and covered under AWS BAA. This matters -- using a non-BAA service for PHI is a compliance violation.
- **Network isolation:** VPC with private subnets for databases and application servers. Public subnet only for load balancer.
- **Backup & DR:** Automated daily backups with 30-day retention. Multi-AZ for RDS. S3 cross-region replication for documents.

## Internal Dev Tooling (Assuming Nothing Exists Today)

| Category | Tool | Monthly Cost |
|----------|------|-------------|
| Source control | GitHub Team | $4/user/mo |
| Project management | Linear | $8/user/mo |
| Design | Figma | $15/user/mo |
| Documentation | Notion | $10/user/mo |
| Communication | Slack | $8.75/user/mo |
| IDE | VS Code (free) + Cursor Pro | $20/user/mo |
| API testing | Postman (free tier) | $0 |
| Password management | 1Password Business | $8/user/mo |

**Total for 5-person team: ~$370/mo**

---

# SECTION 2: TEAM COMPOSITION & HIRING PLAN

## The Team (You + 4 Hires)

**Assumption:** I (Jimmy) am Employee #1, writing foundational code and establishing architecture. The 4 hires augment around me.

### Hire #1 -- Senior Full-Stack Engineer (US-Based) [MOST CRITICAL]

| Attribute | Detail |
|-----------|--------|
| **Location** | US-based (remote) |
| **Seniority** | Senior (5-8 years) |
| **Key skills** | TypeScript/React/Node.js, PostgreSQL, AWS, prior healthcare or fintech experience preferred |
| **Salary range** | $140K-$170K |
| **Why US-based** | This person is my technical co-pilot. They need to overlap my hours for real-time architecture discussions, PR reviews, and paired problem-solving on the hardest problems. Cultural alignment on code quality standards matters here. |
| **When to hire** | Week 1-2. Cannot build fast enough alone. |

**Interview process:**
1. Resume screen (15 min) -- look for from-scratch build experience, not just maintenance
2. Technical phone screen (45 min) -- system design: "Design a multi-tenant SaaS app with role-based access"
3. Take-home coding exercise (2-3 hrs) -- build a small API with auth and tenant isolation
4. Final interview with me + John (60 min) -- culture fit, communication, how they think through ambiguity

### Hire #2 -- Full-Stack Engineer (Offshore) [CRITICAL]

| Attribute | Detail |
|-----------|--------|
| **Location** | Philippines or Latin America |
| **Seniority** | Mid-Senior (3-5 years) |
| **Key skills** | TypeScript/React/Node.js, PostgreSQL, REST APIs, solid testing habits |
| **Salary range** | $35K-$55K |
| **Why offshore** | MEDVA already has deep presence in the Philippines with established infrastructure. We leverage that. |
| **When to hire** | Week 2-3. Starts on frontend buildout while I focus on backend/infra. |

**Interview process:**
1. Resume screen + English communication assessment (written + verbal)
2. Live coding session (60 min) -- pair program on a real feature, evaluate how they think and communicate
3. Technical interview (45 min) -- React component design, API consumption patterns
4. Reference check focused on remote work effectiveness

### Hire #3 -- Backend / DevOps Engineer (Offshore) [HIGH PRIORITY]

| Attribute | Detail |
|-----------|--------|
| **Location** | Philippines or Latin America |
| **Seniority** | Mid-Senior (3-5 years) |
| **Key skills** | AWS (ECS, RDS, S3, IAM), Terraform, CI/CD pipelines, PostgreSQL, Docker, security fundamentals |
| **Salary range** | $35K-$55K |
| **Why this role** | Infrastructure is the foundation. Someone needs to own CI/CD, environments, monitoring, and security posture so I'm not the bottleneck on every deploy. |
| **When to hire** | Month 2. I handle infra myself in Month 1, then hand off. |

**Interview process:**
1. Resume screen + English assessment
2. Infrastructure scenario (60 min) -- "Set up a HIPAA-compliant AWS environment for a multi-tenant app. Walk me through VPC, subnets, security groups, encryption."
3. Hands-on Terraform exercise (take-home, 2 hrs)
4. Team fit interview with me + US senior engineer

### Hire #4 -- Frontend / UI Engineer (Offshore) [CAN WAIT]

| Attribute | Detail |
|-----------|--------|
| **Location** | Philippines or Latin America |
| **Seniority** | Mid (2-4 years) |
| **Key skills** | React/Next.js, TypeScript, responsive design, accessibility, Tailwind CSS |
| **Salary range** | $25K-$40K |
| **Why this role** | Three distinct user portals (Client, VA, Corporate) means significant frontend surface area. Need dedicated UI capacity as we move from MVP to V1. |
| **When to hire** | Month 3-4. After MVP architecture is stable and design system is established. |

**Interview process:**
1. Portfolio/GitHub review + English assessment
2. Live UI build (60 min) -- recreate a dashboard component from a Figma mockup
3. Code review exercise -- review a PR with intentional issues, evaluate their eye for quality
4. Team fit call

## Hiring Priority & Sequencing

| Priority | Role | Start | Why |
|----------|------|-------|-----|
| 1 | Sr. Full-Stack (US) | Week 1-2 | Technical co-pilot, force multiplier |
| 2 | Full-Stack (Offshore) | Week 2-3 | Frontend velocity while I focus backend |
| 3 | Backend/DevOps (Offshore) | Month 2 | Own infra so I'm not the bottleneck |
| 4 | Frontend/UI (Offshore) | Month 3-4 | Portal UI buildout at scale |

## Team Evolution: MVP to V1

During **MVP**, I'm writing 60-70% of backend code personally. The US senior engineer handles the other 30% plus code review. Offshore devs handle frontend and infra under my direct guidance.

During **V1** (AI chatbot), the team shifts. I focus on Bedrock integration and AI pipeline architecture. The US senior engineer steps up as day-to-day tech lead for the core platform. Offshore devs are now autonomous on feature work within established patterns.

**If we need to scale beyond 4:** The next hire would be a dedicated QA/Test Automation engineer (offshore, $25K-$35K) as we approach V1 launch.

## Managing Offshore Teams -- My Approach

This isn't theoretical for me. At Cognizant I managed 50+ devs across US, Ukraine, and Central America. At Red Spot and MedQuest I built teams with offshore resources from zero.

**What works:**
- **Async-first:** Detailed specs, clear acceptance criteria, recorded Loom walkthroughs for complex features
- **Overlap hours:** 2-3 hours of daily overlap (their morning, my evening) for standups and real-time collaboration
- **No ambiguity:** Offshore teams execute best with clear specs. Ambiguity = wasted cycles across time zones
- **Treat as team, not vendor:** Same Slack channels, same standups, same code review standards

---

# SECTION 3: PRODUCT ROADMAP -- MVP > V1 > V2

## Assumptions (Called Out)

1. **MEDVA has an existing PULSE portal** with basic dashboards, task management, and time tracking. This proposal is for the next-generation rebuild, not a patch on the current system.
2. **Existing data** (client records, VA profiles, billing history) will need migration from current systems. I'm assuming we can get API or database access to current data sources.
3. **MEDVA uses HubSpot for CRM and Thinkific for training.** We integrate with these, not replace them, in MVP. Replace-vs-integrate decisions come later based on cost and capability gaps.
4. **Stripe is the target payment processor** per the brief. I'm assuming MEDVA doesn't have an existing Stripe account with complex legacy configuration.
5. **"End of day" for timelines means working days.** Team of 5, no crunch culture, sustainable pace.

## MVP -- Foundation (Months 1-4)

**Goal:** Unified portal entry point with three role-based experiences, real data, secure messaging, billing.

*Reference: The mock-up shows a branded landing page ("Healthcare Staffing Reimagined") where users select their portal: Client, VA, or MEDVA Employee. All three share a unified authentication system but present distinct UIs.*

### Month 1: Infrastructure & Auth
- AWS environment (VPC, ECS, RDS, S3) provisioned via Terraform
- CI/CD pipeline (GitHub Actions to staging and prod)
- Authentication system (email/password + SSO) with role-based access control
- Portal selection landing page -- single entry point, three experiences
- Multi-tenant data model with RLS policies
- Database schema for core entities: organizations, users, roles, VAs, assignments

### Month 2: Core Data & Client Portal
- Data migration pipeline from existing systems
- Client dashboard: KPI cards (Total Spend YTD, Active VAs, Hours Logged, Pending Invoices), Cost Efficiency Analysis chart (MEDVA rate vs. market rate)
- "My Team" view: VA cards with performance scores, role tags, start dates, direct message/report actions
- VA profile pages (headshot, skills, schedule, intro video)
- Settings: notification preferences, security (2FA, password management)

### Month 3: VA Portal, Corporate Portal & Messaging
- VA portal: profile card (role, level, skills, assigned client, supervisor), performance charts (tasks completed, hours logged), MEDVA alerts
- VA schedule: weekly calendar view with shift confirmations
- Corporate staff portal: account overview (Total Accounts, Active VAs, Revenue YTD with target tracking, Critical Alerts), account drill-down with health scoring and retention risk alerts
- Secure messaging center (real-time, WebSocket-based, end-to-end encrypted) -- threaded conversations across all three portals
- IT support ticketing system (integrate with existing tool via API)
- Notification system (email + in-app)

### Month 4: Billing & MVP Polish
- Stripe integration: client billing (credit card + ACH)
- Invoice generation and payment history
- Pay stub access for VAs
- Corporate billing administration and revenue analytics
- Security audit and penetration testing
- **MVP launch to pilot group (10-20% of client base)**

### MVP Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data migration from legacy systems | Could delay launch by weeks | Start migration analysis in Month 1, build migration scripts in parallel with features. Run shadow mode before cutover. |
| HIPAA compliance gaps | Legal/regulatory exposure | HIPAA compliance is architected from Day 1, not bolted on. Engage compliance consultant for audit before pilot launch. |
| Offshore team ramp-up slower than planned | Reduced velocity | Hire US senior engineer first as insurance. Detailed onboarding docs and recorded architecture walkthroughs. |
| Scope creep from stakeholders | MVP becomes V3 | Lock MVP scope with John before starting. Weekly demos to maintain alignment. Say no to feature requests that don't serve the pilot group. |

## V1 -- Medva Frontline AI & Knowledge Base (Months 5-8)

**Goal:** Clients upload SOPs/docs, VAs get "Medva Frontline AI" -- a chatbot trained on client-specific knowledge bases. Plus: AI Extensions marketplace and Medva Academy training platform.

*Reference: The mock-up brands the chatbot as "Medva Frontline AI" with a chat history sidebar, client-specific responses citing the Knowledge Base, and follow-up conversational context. The client portal shows a KB file directory with auto-indexing progress bars. The mock-up also shows third-party AI extensions (Open Evidence, ChatGPT Health, Anthropic Healthcare, Med-AI by Google) as toggleable integrations.*

### Month 5: AI Infrastructure & KB Foundation
- AWS Bedrock integration (Claude or Amazon Titan for LLM)
- S3-based document storage with per-client key prefix isolation
- Document ingestion pipeline: PDF/DOCX/XLSX/TXT parsing, chunking, embedding
- Amazon OpenSearch for vector storage and semantic search
- RAG (Retrieval-Augmented Generation) architecture
- Client KB management UI: file directory, upload/organize/delete, auto-indexing with progress indicators

### Month 6: Medva Frontline AI
- VA-facing chatbot interface: conversational UI with chat history sidebar
- Client-specific responses grounded in uploaded KB documents with source citations
- Conversational context: follow-up questions reference prior answers and KB sources
- Strict tenant isolation: AI queries ONLY return results from that VA's assigned client's KB
- Response quality guardrails (relevance scoring, hallucination detection)
- Audit logging for all AI interactions (HIPAA requirement)

### Month 7: Medva Academy & Extensions
- Medva Academy: built-in training platform replacing Thinkific dependency
  - Training modules with progress tracking (percentage complete, status badges)
  - HIPAA compliance training, ICD-10 updates, soft skills modules
  - Client-configurable training requirements per VA
- AI Extensions framework: pluggable third-party AI tool integrations
  - Client-toggleable extensions (Open Evidence, medical AI tools)
  - VAs access approved extensions through a unified "Extensions" area
  - Sandboxed: extensions cannot access other client data
- Feedback loop: VAs rate AI responses, data feeds back into prompt refinement
- Usage analytics for clients (what are VAs asking about most?)

### Month 8: V1 Launch
- Performance optimization and load testing
- Security audit focused on AI data isolation
- Gradual rollout to full client base
- **V1 launch -- Medva Frontline AI + Academy as new revenue stream**

### V1 Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI tenant data leakage | Catastrophic -- HIPAA violation, trust destruction | Strict per-client vector namespaces in OpenSearch. Every query filtered by org_id at infrastructure level, not application level. Automated testing for cross-tenant leakage. |
| AI response quality / hallucination | User trust erosion | RAG architecture grounds responses in uploaded docs. Confidence scoring on every response. Low-confidence responses flagged and routed to human. |
| Document ingestion at scale | Performance bottleneck | Async processing queue (SQS). Large clients (80+ VAs, thousands of docs) processed off-peak. Progress indicators in UI. |
| Cost overrun on AI inference | Budget blowout | Per-client usage caps. Caching for repeated queries. Start with smaller model, scale up as revenue justifies. |

## V2 -- Scale & Optimize (Months 9-14)

**Goal:** Advanced features, deeper integrations, operational maturity.

- **Matching/assignment engine:** Rule-based first (skills, availability, timezone, language), then ML-enhanced as data accumulates. Corporate portal already shows assignment management -- V2 makes it intelligent.
- **Advanced analytics:** Predictive client health scoring (the mock-up shows "At Risk" indicators and retention risk alerts -- V2 makes these data-driven, not manual), VA utilization optimization, revenue forecasting
- **EHR integrations:** Epic (leveraging MEDVA's existing Secure Facility access), Athena, other practice management systems
- **Mobile app:** React Native for VA-facing features (schedule, Frontline AI chat, time tracking)
- **Self-service client onboarding:** Reduce MEDVA ops team manual work
- **API platform:** Enable enterprise clients to integrate Pulse Portal data into their own systems
- **Extended AI Extensions marketplace:** Expand beyond launch partners, allow clients to request new integrations

---

# SECTION 4: ARCHITECTURE OVERVIEW

## High-Level System Architecture

```
                            +------------------+
                            |   CloudFront     |
                            |   (CDN + WAF)    |
                            +--------+---------+
                                     |
                            +--------+---------+
                            |   Application    |
                            |   Load Balancer  |
                            +--------+---------+
                                     |
                    +----------------+----------------+
                    |                                 |
           +--------+--------+              +--------+--------+
           |   Next.js App   |              |   NestJS API    |
           |   (ECS Fargate) |              |   (ECS Fargate) |
           |                 |              |                 |
           | - Client Portal |              | - REST APIs     |
           | - VA Portal     |              | - WebSocket     |
           | - Admin Portal  |              | - Auth/RBAC     |
           +-----------------+              | - Business Logic|
                                            +--------+--------+
                                                     |
                    +----------------+----------------+----------------+
                    |                |                |                |
           +--------+---+  +--------+---+  +---------+--+  +---------+--+
           | PostgreSQL  |  | DynamoDB   |  |   Redis    |  |    S3      |
           | (RDS)       |  |            |  | (ElastiC.) |  |            |
           |             |  | - Activity |  | - Sessions |  | - Documents|
           | - Users     |  |   logs     |  | - Cache    |  | - KB files |
           | - Orgs      |  | - Events   |  | - Presence |  | - Pay stubs|
           | - Billing   |  | - Chat     |  |            |  | - Media    |
           | - Tickets   |  |   receipts |  +------------+  +------+-----+
           | - Invoices  |  +------------+                          |
           +-------------+                                  +------+-----+
                                                            | OpenSearch |
                                                            | (Vectors)  |
                                                            |            |
                                                            | - KB embed.|
                                                            | - Semantic |
                                                            |   search   |
                                                            +------+-----+
                                                                   |
                                                            +------+-----+
                                                            | AWS Bedrock|
                                                            |            |
                                                            | - LLM API  |
                                                            | - RAG      |
                                                            +------------+

           All resources inside VPC with private subnets.
           RDS, ElastiCache, OpenSearch: no public access.
           ECS tasks in private subnets, ALB in public subnet.
           All traffic encrypted in transit (TLS 1.2+).
           All storage encrypted at rest (KMS).
```

## Authentication, Authorization & RBAC

**Authentication:**
- Email/password with bcrypt hashing + optional SSO (SAML/OIDC) for enterprise clients
- Multi-factor authentication (MFA) required for all users handling PHI
- JWT tokens with short expiration (15 min access, 7-day refresh with rotation)
- Session management via Redis

**Authorization (Role-Based Access Control):**

| Role | Access Scope |
|------|-------------|
| **Client Admin** | Own organization's data: VA profiles, performance, billing, messaging, KB management |
| **Client User** | Read-only view of assigned VAs, messaging |
| **Virtual Assistant** | Own profile, schedule, performance, training, messaging, AI chatbot for assigned client's KB |
| **MEDVA Corporate** | Cross-organization: client management, VA management, matching engine, revenue analytics, billing admin |
| **MEDVA Admin** | Full system access, user management, configuration |

**Implementation:** NestJS Guards + custom RBAC middleware. Every API endpoint declares required role + resource ownership. Database-level RLS as a second layer of defense -- even if application logic has a bug, the database won't return another tenant's data.

## Multi-Tenancy & Data Isolation

**Strategy: Shared database, logical isolation via `organization_id`**

- Every table containing tenant data has an `organization_id` column
- PostgreSQL RLS policies enforce tenant isolation at the database level
- Application sets `current_setting('app.current_org')` on every database connection
- RLS policy: `WHERE organization_id = current_setting('app.current_org')::uuid`
- This means even raw SQL queries cannot access another tenant's data

**Why not separate databases per tenant?**
- 1,000+ clients = 1,000+ databases = operational nightmare
- Schema migrations become a fleet operation
- Cross-tenant analytics (which MEDVA corporate needs) requires federation
- RLS provides equivalent isolation with dramatically less operational overhead

## HIPAA Compliance at Infrastructure Level

| Layer | Control |
|-------|---------|
| **Network** | VPC with private subnets. No direct internet access to databases or application servers. |
| **Encryption at rest** | RDS encryption (AES-256 via KMS), S3 server-side encryption, DynamoDB encryption |
| **Encryption in transit** | TLS 1.2+ everywhere. Internal service-to-service communication also encrypted. |
| **Access control** | IAM roles with least privilege. No long-lived credentials. No developer production access. |
| **Audit logging** | CloudTrail for all AWS API calls. Custom audit tables for all data access/modification. Immutable log storage in S3 with Object Lock. |
| **Backup & DR** | Automated daily RDS snapshots, 30-day retention. S3 versioning with cross-region replication. RTO: 4 hours. RPO: 1 hour. |
| **BAA** | AWS Business Associate Agreement covering all services in use. |
| **Incident response** | Documented breach notification procedures. PagerDuty for automated alerting. |

## AI Architecture -- KB Document Isolation

This is the highest-risk area for HIPAA compliance. A client's uploaded SOPs may contain PHI. Cross-client data leakage in AI responses is unacceptable.

**Document flow:**
1. Client uploads document via portal (S3, encrypted, keyed to `org_id`)
2. Async processing: document parsed, chunked, embedded (SQS + Lambda)
3. Embeddings stored in OpenSearch with `org_id` metadata tag
4. VA asks question via chatbot
5. Query hits OpenSearch with **mandatory `org_id` filter** -- only returns chunks from that VA's assigned client
6. Retrieved chunks + question sent to AWS Bedrock LLM
7. Response returned to VA with source citations

**Isolation guarantees:**
- S3: separate key prefix per org (`s3://kb-docs/{org_id}/`)
- OpenSearch: `org_id` filter is applied at the query level AND enforced via index-level security
- Bedrock: stateless -- no client data persists in the LLM. Every request is independent.
- Automated testing: nightly cross-tenant query tests that MUST return zero results

---

# SECTION 5: BUDGET & VENDOR MANAGEMENT

## Team Cost (Annual)

| Role | Location | Salary | Benefits/Overhead | Total |
|------|----------|--------|-------------------|-------|
| Director of Development (Jimmy) | US | $225,000 | (existing) | $225,000 |
| Sr. Full-Stack Engineer | US | $155,000 | ~30% | $201,500 |
| Full-Stack Engineer | Offshore | $45,000 | ~15% | $51,750 |
| Backend/DevOps Engineer | Offshore | $45,000 | ~15% | $51,750 |
| Frontend/UI Engineer | Offshore | $32,000 | ~15% | $36,800 |

**Total team cost: ~$567K/year** (excluding Jimmy's existing compensation)

## Monthly Cloud Infrastructure Cost

**Assumptions:** 10-20% client adoption = 100-200 active organizations, ~500-1,000 concurrent users at peak.

### MVP (Months 1-4)

| Service | Configuration | Monthly Cost |
|---------|--------------|-------------|
| ECS Fargate | 2 services, 2 tasks each (2 vCPU, 4GB each) | $290 |
| RDS PostgreSQL | db.r6g.large, Multi-AZ, 100GB | $450 |
| ElastiCache Redis | cache.r6g.large, 1 node | $180 |
| S3 | 500GB storage + transfers | $25 |
| CloudFront | 1TB transfer | $85 |
| ALB | 1 load balancer | $25 |
| SES | 50K emails/mo | $5 |
| CloudWatch | Logs + metrics + alarms | $50 |
| Sentry | Team plan (5 users) | $26 |
| WAF | Basic rules | $10 |
| Secrets Manager | 20 secrets | $8 |
| **Subtotal** | | **~$1,150/mo** |

### V1 (Months 5-8) -- Add AI Services

| Service | Configuration | Monthly Cost |
|---------|--------------|-------------|
| MVP infrastructure | (scaled up) | $1,500 |
| AWS Bedrock | ~50K inference calls/mo (Claude Haiku for cost efficiency) | $500-$1,200 |
| OpenSearch | t3.medium.search, 1 node, 100GB | $120 |
| SQS | Document processing queue | $5 |
| Lambda | Document parsing/embedding | $50 |
| Additional S3 | KB document storage (1TB) | $25 |
| **Subtotal** | | **~$2,200-$2,900/mo** |

### Scaling Notes
- At full adoption (1,000 clients), infrastructure scales to ~$8K-$12K/mo
- Fargate auto-scaling handles traffic spikes without pre-provisioning
- Bedrock is the biggest variable cost -- per-client usage caps prevent runaway spend
- Reserved Instances for RDS (1-year commitment) saves ~35%

## Software Licensing (Monthly)

| Tool | Cost | Notes |
|------|------|-------|
| GitHub Team | $20 | 5 users |
| Linear | $40 | 5 users |
| Figma | $75 | 5 users |
| Notion | $50 | 5 users |
| Slack Pro | $44 | 5 users |
| Cursor Pro | $100 | 5 users |
| 1Password Business | $40 | 5 users |
| PagerDuty | $25 | 1 user (on-call) |
| Stripe | 2.9% + $0.30/txn | Variable, pass-through |
| **Subtotal** | **~$400/mo** | (excluding Stripe transaction fees) |

## Total Monthly Operational Cost

| Phase | Infrastructure | Licensing | Team (monthly) | Total |
|-------|---------------|-----------|----------------|-------|
| MVP | $1,150 | $400 | $28,500* | ~$30,000/mo |
| V1 | $2,500 | $400 | $28,500 | ~$31,400/mo |

*Team cost = ($342K annual for 4 hires) / 12. Ramps as hires onboard.

## Cloud Spend Optimization Strategy

1. **Right-sizing:** Monthly review of instance utilization. Downsize underused resources.
2. **Reserved Instances:** Commit to 1-year RDS and ElastiCache reservations after MVP proves stable (~35% savings).
3. **Spot instances:** Use Fargate Spot for non-critical workloads (document processing, batch jobs) -- up to 70% savings.
4. **AI cost controls:** Per-client inference caps, response caching for repeated queries, start with cheaper models (Haiku) and upgrade only where quality demands it.
5. **Automated scaling:** Scale down non-production environments nights/weekends. Auto-scaling policies based on actual load, not peak provisioning.
6. **Cost alerts:** AWS Budgets with alerts at 80% and 100% of monthly target. No surprises.

## Build vs. Buy Framework

| Capability | Decision | Rationale |
|------------|----------|-----------|
| Authentication | **Build** (custom) | HIPAA requirements + multi-tenant RBAC complexity makes off-the-shelf solutions (Auth0, Clerk) either too expensive at scale or too rigid. We need full control. |
| Messaging | **Build** | Core differentiator, needs HIPAA-compliant encryption, deep integration with portal. Third-party chat (e.g., SendBird) adds per-MAU cost that scales poorly at 5,000+ VAs. |
| IT Ticketing | **Buy** (integrate) | Not a differentiator. Integrate with Zendesk or Freshdesk via API. Replace later if needed. |
| Billing/Payments | **Buy** (Stripe) | Per the brief. Stripe handles PCI compliance, ACH, invoicing. Don't build payment processing. |
| AI/LLM | **Buy** (AWS Bedrock) | No reason to host models. Bedrock gives us managed inference with HIPAA eligibility. |
| Training/LMS ("Medva Academy") | **Build** (V1) | The mock-up envisions an integrated training platform with progress tracking, completion badges, and client-configurable requirements. Thinkific can't deliver this level of portal integration. Build as part of V1, migrate existing content from Thinkific. |
| AI Extensions | **Buy + Integrate** | Third-party medical AI tools (Open Evidence, etc.) integrated via APIs with a client-toggleable extension framework. We build the framework, vendors provide the AI. |
| CRM | **Integrate** (HubSpot) | MEDVA already uses HubSpot. Bi-directional sync for client data. Don't replace. |
| Monitoring | **Buy** (CloudWatch + Sentry) | Commodity tooling. Don't build observability. |
| Email | **Buy** (AWS SES) | Commodity. Don't build email delivery. |

**Evaluation criteria for build vs. buy:**
1. Is it a core differentiator? Build.
2. Does it touch PHI and need HIPAA controls we can't delegate? Build.
3. Is it commodity infrastructure? Buy.
4. Does MEDVA already use something that works? Integrate, don't replace.

---

# APPENDIX: KEY ASSUMPTIONS

1. MEDVA will provide API or database access to existing client/VA data for migration
2. Existing PULSE portal continues operating during buildout -- no hard cutover deadline
3. AWS account with BAA is available or will be provisioned
4. MEDVA legal/compliance team is available for HIPAA guidance and audit support
5. John Anderson is the primary stakeholder for scope decisions and prioritization
6. Offshore hiring leverages MEDVA's existing Philippines infrastructure and HR processes
7. Client billing via Stripe starts at MVP launch for pilot group
8. 10-20% adoption rate (100-200 clients) is the target for MVP/V1 cost modeling
