# CHEAT SHEET — Medva Interview (keep on screen)

## MY NUMBERS (grab when needed)
- 4 teams built from scratch (MedQuest 0→22, Red Spot 0→15, Perceptive 0→10, ilumed 4→25)
- 18+ healthcare system integrations (Epic, Athena, CMS)
- 50K → 90K beneficiaries (ilumed)
- 99.9% uptime (ilumed)
- 200K+ appointments, 40% revenue increase (Red Spot)
- 100 centers, 13 states (MedQuest)
- 50+ devs managed across US/Ukraine/Central America (Cognizant)
- 60% error reduction, 500+ hrs saved/yr (MedQuest insurance automation)
- 20% latency reduction (Cognizant microservices)
- $2M annual budget (MedQuest)
- SOC 2 / HITRUST certification led (ilumed)

## HARDEST CHALLENGE → Integration Engine
Problem: 18+ systems, each different protocol (HL7, FHIR, REST, flat files), needed bi-directional
Approach: Adapter pattern → common internal format. Built first 3 connectors myself. Rate-limiting governors per system.
Result: 18+ live, 50K→90K coverage, 99.9% uptime, new system = weeks not months

## ARCHITECTURE KEYWORDS (Pulse Portal)
- Modular monolith first → extract services later
- PostgreSQL + Redis + DynamoDB for event data
- AWS: ECS, RDS, S3, CloudWatch
- CI/CD day one, Terraform IaC
- HIPAA/SOC 2 baked in, not bolted on
- Matching engine: rules first → ML later
- Role-based access: clients, VAs, ops, admin

## OFFSHORE
- Cognizant: 50+ across US/Ukraine/Central America
- MedQuest & Red Spot: offshore resources
- Key: async-first, clear specs, overlapping hours, treat as team

## ANALOGIES (use max 2-3)
- Cathedral/Brick — "Hold the whole cathedral in your head, lay one brick at a time"
- Software Deserts — "$500K team can't solve $1K problem — AI changes that math"
- Wagon — "Everyone pulling the wagon the same direction"

## IF STUCK
- "That's a great question — let me think through that out loud."
- "Before I answer, let me ask a clarifying question..."
- "Here's how I'd approach that — and I'll call out the tradeoffs as I go."
- "In my experience at [company], we faced something similar..."

## QUESTIONS FOR JOHN
1. Most painful workflow today?
2. What does 6-month success look like?
3. Build vs buy philosophy?
4. Current tech landscape?
5. Team evolution over 12-18 months?
