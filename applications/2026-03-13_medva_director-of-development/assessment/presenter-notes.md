# Presenter Notes -- MEDVA Pulse Portal Proposal
## 60-Minute Walkthrough

---

## Slide 1: Title

"Thanks for the time, John. Quick note upfront -- I did use AI to brainstorm and pressure-test ideas throughout this process, but the decisions, trade-offs, and timelines are mine. I've done this type of build before, so the proposal reflects that experience.

I kept this concise intentionally. I'd rather spend our time in conversation than reading slides, so I'll walk through each section and we can go deeper wherever you want."

*[~45 sec]*

---

## Slide 2: Proposal Overview

"Five sections matching what you asked for. Tech stack, team, roadmap, architecture, budget. I'll go in order -- stop me anytime.

I referenced the mock-up video throughout to make sure my proposal aligns with what MEDVA is actually envisioning."

*[~20 sec]*

---

## Slide 3: Tech Stack

"TypeScript end-to-end, frontend and backend. With a five-person team, I need engineers who can work on both sides of the codebase. One language eliminates context-switching and hiring fragmentation.

Next.js gives us server-side rendering for the dashboard views -- KPI cards, charts, team rosters need to load fast. NestJS on the backend provides enterprise structure -- guards, modules, dependency injection -- without the weight of Java or .NET.

The most important decision on this slide is the modular monolith. At team size five, microservices create more infrastructure overhead than they solve. Service discovery, distributed tracing, independent deploys -- that's a full-time job. Instead, we design clean domain boundaries inside a single deployable and extract services later when the team and product justify it. I've made this call before at Red Spot and Cognizant -- same reasoning applied.

Aurora Serverless v2 over standard RDS because it auto-scales with load and drops to near-zero off-hours. Makes sense for a platform with peak usage during US business hours.

Cognito for auth. Not building authentication from scratch with five people. It handles MFA, SSO, user pools, and it's on the HIPAA BAA list. We layer RBAC on top with NestJS guards.

For the AI layer, Claude through AWS Bedrock. Claude is the strongest model available for instruction-following and grounding responses in retrieved documents, which is exactly what the KB chatbot needs. Bedrock gives us managed inference, HIPAA BAA coverage, and pay-per-call pricing. No GPU management, no model hosting.

Fargate over EKS for the same reason as the monolith decision -- Kubernetes adds operational overhead we don't need yet."

*[~3 min. Expect questions about why not Python/Go, or why not microservices from day one.]*

---

## Slide 4: HIPAA/SOC 2

"Compliance is a foundation, not a feature. Retrofitting it later costs significantly more. I went through this at ilumed leading SOC 2/HITRUST certification.

Every AWS service in the stack is on the HIPAA BAA list. Encryption at rest via KMS, in transit via TLS 1.2 minimum. Zero developer production access -- all changes go through the application layer. CloudTrail plus custom audit tables for all data access. These aren't aspirational -- they're the baseline from Day 1."

*[~1 min]*

---

## Slide 5: Team Composition

"Four hires -- one US, three offshore.

The US hire is a DevOps and Security engineer. HIPAA-compliant infrastructure is the highest-risk foundation item. VPC configuration, encryption, IAM policies, CI/CD, monitoring -- this needs to be right from Day 1. Having a senior person own that frees me to focus on application architecture and core backend code.

Lead Backend engineer starts offshore in Week 1. Senior-level -- they own significant portions of the API layer. NestJS, PostgreSQL, RBAC patterns. Needs to be someone who delivers production-quality code from well-scoped specs.

Full-stack engineer in Week 2-3 for frontend. Building out the three portal experiences. Charts, data tables, messaging UI.

UI/UX engineer can wait until Month 2-3 after the design system is established. Three portals create a large frontend surface area, so dedicated UI capacity matters as we approach V1.

Salary ranges reflect actual offshore market rates for Philippines and Latin America. I've hired at these levels at Red Spot, MedQuest, and Cognizant."

*[~2.5 min]*

---

## Slide 6: Interview Process

"Each role has a tailored process, but the common thread is a practical exercise. I want to see how people work, not just hear about it.

DevOps: walk me through a HIPAA-compliant AWS setup. Lead Backend: pair program on a tenant-isolated endpoint. Frontend roles: build from a Figma mockup.

Communication is weighted heavily for offshore roles. The primary failure mode with distributed teams is ambiguity from communication gaps, not technical skill. The approach that's worked for me -- at Cognizant across US, Ukraine, and Central America, and at Red Spot and MedQuest -- is async-first with protected overlap hours. Detailed specs, recorded walkthroughs for complex features, 2-3 hours of daily overlap for real-time collaboration."

*[~1.5 min]*

---

## Slide 7: Roadmap

"Let me walk through the three phases, but instead of just listing features, let me describe what users actually experience at each stage.

**MVP -- 10 weeks.** A client like Dr. Smith opens portal.medva.com. CloudFront serves the page, WAF checks the request. She lands on the branded landing page and clicks 'I am a Client.' Cognito login with MFA -- required because she may see PHI. She gets a JWT with her role and organization.

Her dashboard loads: Total Spend YTD, Active VAs, Hours Logged, Pending Invoices. A Cost Efficiency chart comparing MEDVA rates to market rates. 'My Team' shows her VA cards with performance scores. She can click into a VA's profile, send a message through the encrypted messaging center, or check invoices.

On the VA side, Maria Santos logs in, sees her profile card -- role, skills, assigned client, supervisor. Her performance chart, weekly schedule, MEDVA alerts like 'New HIPAA Compliance Training available.' She can message Dr. Smith directly.

Corporate staff like James Wilson sees across all accounts -- Total Accounts, Active VAs, Revenue YTD with target tracking, Critical Alerts. He drills into BrightSmile Dental and sees a retention risk alert: performance issue with a VA, transfer request due to schedule conflicts. Quick actions to adjust billing or add a new placement.

All of this is backed by the same infrastructure. Every API call goes through RBAC guards, every database query is filtered by organization_id through RLS. Aurora handles the relational data, DynamoDB handles high-volume events like activity logs, Redis handles sessions and real-time presence for messaging.

That's MVP. No billing, no AI, no training. The goal is to validate the infrastructure and get feedback from the pilot group.

**V1 -- adds 14 weeks, about six months total.** Now Dr. Smith has a Knowledge Base section. She uploads Office_Protocols_2024.pdf, an insurance list, phone scripts. Files go to S3 under her org's prefix, encrypted via KMS. An async pipeline parses, chunks, and embeds the documents. OpenSearch stores the vectors tagged with her organization ID. A progress bar shows 'Indexing Complete.'

She also toggles on Open Evidence as an AI Extension -- now her VAs can access that third-party medical AI tool through the portal.

Maria opens Medva Frontline AI. Chat history sidebar shows previous conversations. She types 'What is the procedure for dental code CO-16?' Her question hits the API. The API knows she's assigned to Apex Cardiology. OpenSearch query with mandatory org_id filter pulls chunks from only Apex's documents. Those chunks plus her question go to Claude via Bedrock. Claude generates a response grounded in Apex's uploaded protocols: 'According to Office_Protocols_2024.pdf...' Bedrock is stateless -- nothing about Apex persists after the request. She asks a follow-up about enrolling a patient and the conversational context carries through.

She can also access Open Evidence through the Extensions area -- sandboxed, can't touch Apex's KB data. She goes to Medva Academy and sees her training modules with progress tracking: HIPAA Advanced Security at 90% complete, ICD-10 Coding Updates at 40%.

V1 is also when Stripe billing goes live for clients. CC and ACH. And with billing in place, VAs get pay stubs -- integrated directly into their portal so they can view and download payment history.

**V2 -- months 9 through 14.** Matching engine, predictive analytics, EHR integrations through MEDVA's Epic Secure Facility, mobile app for VAs, self-service client onboarding."

*[~5 min. This is the longest section but it demonstrates product thinking, not just tech decisions. John will likely probe the 10-week MVP timeline and AI isolation.]*

---

## Slide 8: Technical Risks

"The biggest risk at MVP is data isolation. In a multi-tenant healthcare system, cross-tenant data leakage is a HIPAA violation and a trust problem. Mitigation is defense in depth: organization_id on every table, RLS at the database level, automated security scans in CI, and an external pen test before pilot launch.

At V1, the risk amplifies with AI. Client knowledge bases may contain PHI. If the chatbot surfaces documents from the wrong client, that's a serious compliance issue. Mitigation: per-client vector namespaces in OpenSearch, mandatory org_id filter at the infrastructure level, and automated nightly cross-tenant query tests. If any test returns results, the pipeline stops.

The more practical risk is scope creep. Mitigation is straightforward -- lock MVP scope before we start, demo weekly, and be disciplined about what's in scope for the pilot."

*[~2 min]*

---

## Slide 9: Architecture Diagram

"I essentially just walked through this in the roadmap, but let me connect it to the diagram.

Top layer: users come through CloudFront with WAF. Three portal experiences, one entry point.

Authentication through Cognito. MFA required for PHI access. JWT carries role and organization claims.

API layer: NestJS on Fargate in a private subnet. Every request hits RBAC guards first, then the tenant context middleware sets the organization_id on the database connection. From that point, RLS handles isolation automatically.

Data layer: Aurora for relational data, DynamoDB for high-volume events, Redis for sessions and caching, S3 for documents.

AI layer: S3 documents flow into OpenSearch for vector storage, queries go to Claude via Bedrock with mandatory org_id filtering.

Bottom: CloudWatch, GuardDuty, CloudTrail, KMS, Secrets Manager, Stripe. The operational backbone.

Everything in private subnets. Only CloudFront is public-facing."

*[~2 min]*

---

## Slide 10: Auth & Multi-Tenancy

"Three areas that define whether a multi-tenant HIPAA platform works.

Auth: Cognito for the identity layer, five RBAC roles on top. Defense in depth -- application-level guards plus database-level RLS. Two independent layers. A bug in one doesn't compromise the other.

Multi-tenancy: shared database, logical isolation via organization_id with PostgreSQL RLS. The alternative is separate databases per tenant, which at 1,000+ clients means unmanageable schema migrations and cross-tenant analytics requiring federation. RLS provides equivalent isolation with far less operational complexity.

One important nuance: corporate staff like James Wilson need cross-tenant visibility for account management and revenue analytics. Their role bypasses RLS for read-only analytics views, but write operations are still scoped. This is by design -- it's the whole point of the corporate portal."

*[~2 min]*

---

## Slide 11: AI KB Isolation

"This is the highest-risk area and the one I want to make sure we're aligned on.

Seven steps. Client uploads a document -- goes to S3 under a tenant-specific prefix, encrypted. Async pipeline parses, chunks, and embeds. Embeddings go to OpenSearch tagged with org_id. When a VA asks a question, the query hits OpenSearch with a mandatory org_id filter -- infrastructure-level, not application-level. Chunks from only that client's KB are retrieved. They go to Claude via Bedrock, which is stateless -- no client data persists in the model. Response comes back with source citations.

The seventh step is the safety net: automated nightly tests that query every client's namespace with every other client's org_id. If anything comes back, the pipeline stops. No human judgment call, no manual review. It just stops.

The key principle: Bedrock never retains data. Isolation is enforced in OpenSearch at the infrastructure level. Even if someone made a mistake in the application code, the vector store won't return the wrong client's documents."

*[~2.5 min]*

---

## Slide 12: Budget

"Cloud infrastructure: $800-$1,200 per month at MVP. Low because Aurora Serverless scales to near-zero off-hours and Fargate charges only for running containers.

V1 adds Bedrock inference as the main variable -- $500-$1,200 per month depending on usage. Full adoption scales to $8K-$12K per month.

Team cost: about $330K annually for the four hires. US DevOps is the largest item at roughly $195K with benefits. Three offshore roles total about $135K.

Software licensing: about $400 per month. Stripe fees are pass-through.

Optimization approach: Aurora auto-scaling, Savings Plans after MVP stabilizes for roughly 35% off compute, Fargate Spot for batch processing, per-client Bedrock usage quotas, and monthly FinOps reviews."

*[~2 min]*

---

## Slide 13: Build vs. Buy

"The framework I'd apply to every decision going forward: build if it's a core differentiator or touches PHI and needs full compliance control. Buy if it's commodity. Integrate if MEDVA already uses it and it works.

Messaging: build. Core feature, needs E2E encryption, and per-MAU pricing from third parties scales poorly at 5,000+ VAs.

Auth: buy. Cognito.

Frontline AI: hybrid. We build the RAG pipeline and UI, Claude via Bedrock provides inference. We own the data isolation layer.

Academy: build in V1. The mock-up shows integration depth that Thinkific can't deliver.

Extensions: we build the pluggable framework, vendors provide their AI via API.

Billing: Stripe. Ticketing: Zendesk or Freshdesk via API. CRM: HubSpot integration, don't replace."

*[~2 min]*

---

## Slide 14: Closing

"To summarize -- 10-week MVP followed by a 14-week V1, built on AWS with a five-person team. HIPAA compliance from Day 1, practical technology choices for the team size, and a phased rollout that gets real product in front of real clients early.

I'm happy to go deeper on any section. Thank you."

*[~30 sec]*

---

## Total Time: ~28-30 min presentation + ~30 min Q&A

---

## Likely Questions & Prepared Answers

0. **"The brief defined V1 as the AI chatbot. Why did you add Academy, billing, pay stubs, and Extensions?"**
"The chatbot is the centerpiece of V1 -- that's where the engineering complexity lives. But the brief also describes a new revenue stream where clients pay a monthly fee for AI services. You can't charge for AI without billing in place. And once billing is live, pay stubs for VAs are a natural dependency -- the data's already flowing. Academy and Extensions round out the value package so the full rollout isn't just a chatbot, it's a complete platform upgrade clients are willing to pay for. I grouped them because shipping these piecemeal means multiple rollout disruptions instead of one."

1. **"10 weeks for MVP feels aggressive. What if it slips?" / "Can you really do it in 8-10 weeks?"**
"I'll have a working skeleton -- API scaffold, auth, RBAC, database schema with RLS, portal routing -- before the first hire writes a line of code. The team builds on a foundation, they don't build the foundation. From there, 6 weeks of parallel feature buildout plus a week for security audit and pilot prep. The scope is deliberately lean -- no billing, no AI, no training in MVP. If hiring takes longer than expected, the timeline shifts but the scope doesn't expand. Weekly demos keep progress visible."

2. **"Why not microservices from the start?"**
"With five people, we'd spend more time on infrastructure than features. The modular monolith gives us the same domain separation without the operational overhead. We extract when team size and scaling needs justify it."

3. **"What happens if a VA sees another client's data through the AI?"**
"That's the scenario I designed most defensively against. Per-client vector namespaces, mandatory org_id filter at infrastructure level, Bedrock stateless inference, source citations for verification, and automated nightly cross-tenant tests. If any test fails, the pipeline stops automatically."

4. **"You've been in leadership roles recently. Are you going to write code?"**
"Yes. At ilumed I designed the integration engine architecture and directed the build across the team. At Red Spot I was there from the beginning -- selected the stack, defined the architecture, and built alongside the engineers as the team grew. My recent roles have been more leadership-heavy, which is exactly why this role appeals to me. 80/20 hands-on to leadership is where I do my best work."

5. **"How do you manage disagreements with offshore teams?"**
"Clear specs prevent most of them. When they happen, I defer to the person closest to the code if they have better context. Architectural decisions are mine -- I make the call, explain the reasoning, and document it."

6. **"What about the existing PULSE portal? Migration risk?"**
"Parallel operation. Existing portal keeps running while we build. Migration analysis starts Week 1, scripts built in parallel, shadow mode before cutover. No gap in service."

7. **"Why Claude / Bedrock over self-hosted or OpenAI?"**
"Three reasons. Claude is the strongest model for instruction-following and grounding responses in retrieved documents -- that's the core of the KB chatbot. Bedrock gives us HIPAA BAA coverage, which OpenAI doesn't offer natively. And managed inference means no GPU management or model hosting overhead for a team of five. Cost scales with usage."

8. **"Walk me through what happens when a VA asks the chatbot a question."**
"Sure. Maria is assigned to Apex Cardiology. She types a question in Frontline AI. Her request hits the NestJS API, which knows her assigned org_id is Apex. The API sends a search query to OpenSearch with a mandatory org_id=apex filter -- this is infrastructure-level, the application can't bypass it. OpenSearch returns the most relevant document chunks from Apex's uploaded files only. Those chunks plus Maria's question go to Claude via Bedrock. Claude generates a response grounded in those specific documents, with source citations so Maria can verify. Bedrock is stateless -- after the response, nothing about Apex's documents persists in the model. If Maria asks a follow-up, conversational context is maintained in the session, but the vector search still runs fresh with the same org_id filter."

9. **"How does the corporate portal see across all clients without violating tenant isolation?"**
"By design. Corporate users like account managers have a role that grants cross-tenant read access for analytics and account management. The RLS policy has a carve-out: if your role is MEDVA_Corporate or MEDVA_Admin, the org_id filter doesn't apply to read queries. But write operations are still scoped -- a corporate user can view BrightSmile Dental's metrics but can't modify their data without explicit action. Audit logging captures every cross-tenant access."

10. **"What if a client uploads a massive document library? How does ingestion scale?"**
"Async processing through SQS and Lambda. Large clients with thousands of documents get queued and processed off-peak. The progress bar in the UI shows indexing status. Lambda scales automatically with queue depth, and we set concurrency limits to prevent cost spikes. OpenSearch Serverless handles the storage scaling. A large client with 80+ VAs and a big document library doesn't block the system for everyone else."
