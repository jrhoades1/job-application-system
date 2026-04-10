# MEDVA Take-Home Assessment -- Original Brief

**From:** John Anderson, VP of Technology, MEDVA
**To:** Jimmy Rhoades
**Date:** April 6, 2026
**Deadline:** Monday April 13th by 11:59pm ET via email to janderson@MEDVA.com

---

## John's Email

> Hi Jimmy,
>
> Attached is the copy of the take home assessment. As a reminder, we're not looking for a 50-page presentation; we value clarity of thought, organized and easy to follow information and the ability to go deeper at various levels of discussion as needed. You are free to make assumptions with the information you have, but please call out those assumptions as appropriate.
>
> If you have any questions let me know, otherwise we'll look forward to your submission no later than Monday, April 13th, 2026, at the end of day.

---

## THE BRIEF

You are the incoming Director of Development at MEDVA. Your first assignment is to build the MEDVA Pulse Portal from scratch: a multi-tenant, role-based web application that serves as the central nervous system for three user types:

| User Type | Core Needs |
|-----------|-----------|
| Clients | Dashboard of VA performance metrics, billing/invoicing, secure messaging center, IT support ticketing, KB ingestion for AI chatbot |
| Virtual Assistants | Profile management, training modules, schedule management, performance self-view, pay stubs, AI chatbot access, IT support ticketing, secure messaging center |
| MEDVA Corporate Staff | Client management, VA management, matching/assignment engine, revenue analytics, billing administration, IT support ticketing, secure messaging center |

The system must be HIPAA-compliant, integrate with the existing SaaS tools MEDVA uses, and eventually support Stripe for client billing via Credit Card & ACH. Assume MEDVA operates with 5,000+ VAs across the Philippines & Latin America and serves ~1000 different clients in the US.

### Additional Context

- A client might have 1 to many VAs assigned to them. Large clients might have 80+ VAs.
- Clients today pay MEDVA for the staff, and in the future state will pay a monthly fee for the AI services inside the portal.
- The end goals of the portal are to deliver an additional layer of value to clients & VAs, introduce a new revenue stream, allow clients to self-serve -- all while improving our professional posture to the market.
- Use this recording of a reference mock-up as needed. [link to video]
- Where you have questions or feel there is not enough info, you can make assumptions. Be sure to note & call out when making a large assumption.

---

## WHAT WE'RE ASKING YOU TO DELIVER

Prepare a proposal (slide-deck presentation, document, or format of your choice) covering the following five areas. We're not looking for a 50-page document, we want to see how you think, prioritize, and communicate technical decisions. Using AI to brainstorm and conceptualize is ok. Copy-and-pasting unvetted AI output is not.

### 1. Technology Stack Recommendation
- Frontend framework, backend language/framework, database(s), infrastructure/cloud services, CI/CD tooling, monitoring/observability. Assume AWS ecosystem for cloud services.
- For each choice: Why this over the alternatives? What trade-offs are you making?
- How does HIPAA/SOC 2 compliance influence your stack decisions?
- What technology and tools will you and your team need internally to build this solution? Assume there is nothing in place today.

### 2. Team Composition & Hiring Plan
- For the purposes of this exercise you assume you can hire 4 team members to help build this portal. One can be US-based, the other 3 must be offshore.
- For each role: title, seniority level, key skills, and whether US-based or off-shore, likely salary range.
- What does your high-level interview process look like for each role?
- Who is most critical, who can wait?
- How does team composition evolve (if at all) as you move from MVP to V1?

### 3. Product Roadmap: MVP > V1 > V2
- MVP: Base backend infrastructure established, adequate front-end UI, user auth and some data-dips presented to users in a meaningful way. Target timeline?
- V1: Using AWS Bedrock to build an AI-powered KB trained chatbot. Client uploads their files (SOPs, Documentation, etc.) into MEDVA portal and they get ingested into the AI Chatbot for VAs to utilize. Target timeline?
- Identify your biggest technical risks at each stage and how you'd mitigate them.

### 4. Architecture Overview
- High-level system architecture diagram (doesn't need to be fancy, whiteboard-quality is fine).
- How you handle authentication, authorization, and role-based access control.
- Data model approach: multi-tenancy strategy, data isolation between practices.
- How do you approach HIPAA compliance at the infrastructure level?
- AI -- where do client KB documents live, how does AI ingest them, how do you ensure users AI queries only touch data related to that specific client?

### 5. Budget & Vendor Management
- Estimated monthly cloud infrastructure cost at each milestone, assume some level of user adoption in the 10-20% range of existing client base. (MVP & V1).
- Software licensing costs (tooling, SaaS dependencies, CI/CD, monitoring).
- How do you manage and optimize cloud spend as the product scales?
- What third-party vendors or services would you rely on, and how do you evaluate build vs. buy?

---

## LOGISTICS

| Item | Detail |
|------|--------|
| Deadline | Monday April 13th by 11:59pm ET via email to janderson@MEDVA.com. Submitting earlier is OK. |
| Format | Your choice: slide deck, document, Notion page, Loom, word doc, combo, etc. |
| Length | Whatever you need -- but we value conciseness and clarity of thought over volume |
| Presentation | Once received, MEDVA will schedule a walkthrough of your proposal in a 60-minute follow-up call. You may be asked questions in real-time. |
| What We're Evaluating | Clarity of thought, prioritization instincts, technical depth, communication quality, realism of timeline, logistics and budgeting practicality. The way this info is presented is also part of the evaluation. |
