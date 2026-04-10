# Medva Interview Study Guide — 3/30 1pm EST

**Interviewer:** John Anderson, VP of Technology (your future boss)
**Platform:** Microsoft Teams
**Vibe:** They want to hear you THINK. Talk through everything out loud.

---

## About Medva

- Healthcare virtual assistant staffing company
- 900+ client orgs (doctors, dentists, orthodontists)
- 2,500+ virtual assistants
- 115 employees, ~90 in the Philippines
- Building **Medva Pulse Portal** — role-based hub for clients, VAs, and internal teams
- You'd be Employee #1 on R&D team

## What John Is Evaluating

1. **Can you build from scratch?** Not maintain, not modernize — build.
2. **Can you think through architecture in real time?** He wants to watch you design.
3. **Can you communicate clearly while doing it?** Talk through tradeoffs.
4. **Can you work with offshore teams?** 90 of 115 employees are in Philippines.
5. **Are you a player, not just a coach?** 80% hands-on, 20% leadership.

---

## Your Opening (30 sec — Past/Present/Future)

**Past:** "20+ years in healthcare technology. Built four engineering orgs from scratch."

**Present:** "Most recently CTO at ilumed — scaled engineering from 4 to 25, architected an integration engine connecting 18+ hospital systems, led SOC 2/HITRUST certification. But the pattern that maps to Medva is Red Spot — I was employee #1, built the team from zero to 15, selected the stack, wrote the foundational code."

**Future:** "You have 2,500+ VAs, 900+ clients, and no centralized platform. I've done this exact thing four times. Medva would be the fifth."

---

## "Hardest Technical Challenge" (CONFIRMED question)

**Use: Protocol-Agnostic Integration Engine**

The problem:
- Connect to 18+ healthcare systems (Epic, Athena, CMS, clearinghouses)
- Each speaks a different protocol — HL7, FHIR, flat files, proprietary REST
- Needed BI-DIRECTIONAL flow — read data in AND push alerts/notes back

Your approach:
- Designed adapter pattern — each connector translates to common internal format
- Built the first three connectors personally before hiring engineers for the rest
- Built governors/rate limiters per connector — CMS batch loads couldn't overwhelm smaller practice systems

The result:
- 18+ live connections, 50K to 90K beneficiary coverage, 99.9% uptime
- Adding a new system went from months to weeks

**Key: Emphasize YOU owned it. You designed it. You built the first connectors.**

---

## Architecture Discussion — Pulse Portal

**Ask clarifying questions first:**
- What's the current tech? Anything to inherit or integrate with?
- How are clients/VAs/ops managed today? Spreadsheets? Third-party tools?
- What's the most painful workflow right now?
- Any existing data sources (CRM, billing, HRIS) to connect to?

**Your high-level design:**

1. **Auth & Roles** — Role-based access (clients, VAs, ops, admin). HIPAA-compliant identity from day one.
2. **Core Services** — Matching engine, scheduling/availability, productivity tracking, billing/payments (1099 model). Bounded domains, not a monolith.
3. **Data** — PostgreSQL for relational (users, contracts, billing), Redis for caching, possibly DynamoDB for high-volume event data (VA activity logs).
4. **Integration** — REST APIs + webhooks. Client portal, VA app, internal dashboards, payment processor integrations.
5. **Infrastructure** — AWS. Containers (ECS/EKS), managed Postgres (RDS), S3 for docs, CloudWatch monitoring. CI/CD from day one. IaC with Terraform.

**Tradeoffs to call out:**
- "Start modular monolith, not microservices — premature at team size of 1. But design boundaries cleanly for extraction later."
- "Matching engine: rule-based first, add ML as data accumulates."
- "Security baked in from day one — encryption at rest, audit logging, least-privilege. Don't bolt on HIPAA compliance later."

---

## Offshore Team Experience

**Your proof:**
- Cognizant: 50+ devs across US, Ukraine, Central America
- MedQuest: Team of 22 including offshore
- Red Spot: Team of 15 with offshore resources

**Key messages:**
- Async-first: good docs, clear acceptance criteria, overlapping hours for collaboration
- Philippine teams: overlap their morning / your evening for standups, clear specs during their execution time
- Success = clear specs (no ambiguity) + treat them as team (not outsourced labor)

---

## Stories Ready to Deploy

| Question | Story | Key Numbers |
|----------|-------|-------------|
| Hardest challenge | Integration Engine | 18+ systems, 50K→90K, 99.9% uptime |
| Building from scratch | Red Spot from zero | 0→15 engineers, 200K+ appointments |
| Team scaling | ilumed 4→25 | Company 140→200 headcount |
| Architecture thinking | 5-Part System (ilumed) | 5 layers, 18+ data sources |
| Turnaround | MedQuest imaging | 100 centers, 13 states |
| AI vision | Dark Software Factory | Intent hierarchy, software deserts |
| Automation ROI | Insurance verification | 60% error reduction, 500+ hrs saved/yr |

---

## Questions to Ask John

1. "What's the most painful operational workflow today you want solved first?"
2. "What does success look like 6 months in?"
3. "How does the CTO think about build vs. buy?"
4. "What's the current tech landscape — any systems to integrate with?"
5. "How do you see the engineering team evolving over 12-18 months?"

---

## Tactical Reminders

- Talk through your thinking OUT LOUD — this is what they're evaluating
- Lead with clarifying questions before designing anything
- Call out your own tradeoffs before they ask
- One analogy per topic, max
- Don't fight hypotheticals — play along and show you know the tools
- Test Teams link by 12:50
