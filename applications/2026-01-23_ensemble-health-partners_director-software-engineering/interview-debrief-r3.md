# Interview Debrief — Round 3: Technical Panel

**Date:** 2026-03-05
**Duration:** ~75 minutes (full allocation used)
**Interviewer:** Jesse Estum, Distinguished Engineer / VP of Software Engineering
**Format:** Video call with screen share, system design exercise + discussion
**Note:** Dragon Sky (Software Engineer) was listed on the invite but does not appear in transcript — may have observed silently or was absent.

---

## Interview Flow

| Segment | Duration | Topic |
|---------|----------|-------|
| Intros | ~5 min | Jesse intro (Distinguished Engineer, 1yr at Ensemble, Minnesota), Jimmy's 30-second pitch |
| System Design | ~35 min | URL shortener — progressive complexity, scaling, failure modes |
| AI Discussion | ~15 min | Dark Software Factory, software deserts, intent hierarchy, coding AI state of the art |
| Healthcare Protocols | ~5 min | FHIR, HL7, Epic, Cerner, Athena, EDI, protocol-agnostic integration |
| Jimmy's Questions | ~15 min | Mendel acquisition integration, pod structure and staffing philosophy, QA approach |

---

## System Design Exercise: URL Shortener

**Problem:** Classic URL shortening service — input long URL, output short URL (domain + 8 random alphanumeric chars), redirect on click.

**What I did well:**
- Asked clarifying questions immediately (human readable? fixed domain? max length?)
- Identified two user journeys (create vs. consume) before prompted
- Sketched high-level flow first, then drilled into components
- Suggested deduplication check before creation
- Proposed relational database with simple table (original_url, short_url, creation_date)
- Identified failure modes: randomizer performance, input validation, graceful degradation
- Scaling: vertical first, then horizontal sharding (A-D, E-G, etc.)
- Added TTL/cleanup job for cost management (180-day expiration, nightly batch)
- Proposed write queue for elasticity, then caught the eventual consistency trap when Jesse pushed on it

**Where I stumbled:**
- Spent time on encryption/hashing approach before Jesse redirected to random generation — took the redirect but ate ~3 minutes
- When pushed on NoSQL alternatives at extreme scale, couldn't name specific key-value stores (Redis, DynamoDB, Cassandra) — acknowledged the gap honestly
- Said "I don't think I'd hit that limit" on the relational DB which Jesse noted was hypothetical

**Jesse's explicit feedback:** "For a director... the expectation would you more than met it — can you sketch out something that could work, can you ask good questions, can you with limited context pick up the business problem and start on a reasonable path, and you didn't falter there."

---

## AI Discussion Highlights

**Dark Software Factory concept:**
- Described the vision: specs in, tested code out, no human in the loop
- Skills architecture: reusable skills at org level, data at project level
- Intent embedded in skills with hierarchical priority

**Software deserts:**
- $500K dev team can't solve $1,000 problem — AI changes that economics
- Find where humans were inserted because automation was too expensive
- Ensemble-specific: where did the flow stop and a human got inserted?

**Intent hierarchy (3 layers):**
- Values level: "be kind to the customer"
- Business rules: "keep retention below 5%"
- Operational: "try to end calls in 3 minutes"
- System must know priority order — without it, AI optimizes wrong metric (3-min calls but customers churn)
- Illustrated with call center example that resonated well

**Coding AI state of the art:**
- Pre-Thanksgiving 2025: "writes okay code but misses a lot"
- Post-December 2025: "actually looks pretty good"
- Current debate is about "taste" (patterns, architecture) not functionality
- This is what developers always argued about anyway

**Jesse's reaction:** "Interesting, I like it" — engaged, asked follow-up questions about specific tools/models

---

## Healthcare Interoperability

- Described protocol-agnostic integration engine built at ilumed
- Named specific protocols: FHIR (Epic), REST APIs (Athena), HL7 (Cerner), EDI, batch
- Used the "speak whatever language they want" analogy — can't tell Epic to switch to FHIR
- Jesse asked this as a resume validation — answered fluently, no hesitation

---

## Intel Gathered

### Jesse Estum
- **Title:** Distinguished Engineer ("whatever that means" — his words, but clarified as hands-on technical + people leadership)
- **Tenure:** ~1 year at Ensemble
- **Location:** Minnesota
- **Style:** Collaborative, conversational, gives explicit feedback. Uses system design as a calibration tool across levels (staff vs director expectations differ)

### Pod Structure & Philosophy
- Pods aligned to value streams (e.g., "reduce claim denial rate")
- Staffed with right mix for the problem — not one-size-fits-all
- Orchestration Works co-location in Austin reduces "musical chairs" temptation
- Intent is to make pods durable — don't shuffle people around

### QA Philosophy
- **No dedicated QA roles** in Orchestration Works — SDET roles exist elsewhere but Jesse is against them
- Engineers own quality: unit tests, integration tests, Playwright/Selenium, CI/CD automation
- Factory/conveyor belt metaphor: separate QA creates inventory pileups and finger-pointing
- "Ownership of the problem instead of ownership of the task"

### Mendel AI Integration
- Acquired company, now full employees — but friction doesn't disappear
- **Security:** HITRUST-certified company acquiring a startup = security bar gap, walled garden until caught up
- **Cultural:** 50 engineers joining 10K-person company, "just get it done" vs "socialize the idea" mentality
- **Technical:** Chief AI officer says "you can't hire my guys to write if/then/else" — AI team and platform team are somewhat separated, creating integration surface area risk
- **Mendel's prior work:** 200 clinicians in Egypt annotating clinical data, training custom models, clinical trials/anonymized records research
- **Current state:** "Working in some use cases reasonably well... there's a lot more potential"
- **Tension:** Sometimes custom models are better, sometimes Azure OpenAI tokens are cheaper — diversity of approaches

### Open Roles
- Staff Software Engineer position open — would be director's "right hand"
- No SDET/QA-specific roles planned for Orchestration Works
- All software engineer titles: SE, Senior SE, Staff SE, Director

---

## What Landed

1. **30-second intro** — Jesse called it "excellent framing"
2. **System design approach** — explicitly passed director-level bar
3. **Dark Software Factory + intent hierarchy** — genuinely differentiated, Jesse engaged
4. **"If you're not running out of tokens you're not thinking big enough"** — good line (used twice, watch repetition)
5. **Mendel acquisition question** — showed homework, got detailed insider answer
6. **Pod/QA philosophy alignment** — natural agreement on engineer-owned quality, ownership of problems
7. **Healthcare interoperability fluency** — validated resume claims

## What to Improve

1. Take interviewer redirects faster (encryption tangent)
2. Know specific NoSQL stores for scaling scenarios (Redis for cache/lookup, DynamoDB for key-value at scale, Cassandra for write-heavy)
3. Avoid repeating the same strong line twice in one conversation

---

## Signals & Next Steps

**Positive signals:**
- Jesse explicitly said expectations were "more than met"
- Gave detailed insider info (Mendel, pod philosophy, QA stance) — wouldn't share with someone they're screening out
- "Bethany should be in contact with you on short order for next steps"
- Used full 75 minutes, natural conversation energy throughout
- Let Jimmy ask several questions at end

**Watch for:**
- Dragon Sky's absence — was listed as co-interviewer. May need separate session
- Whether "next steps" means another round or offer stage
- Follow up with Bethany if no contact within 3-5 business days

**Assessment: Strong pass. Expect advancement to next round or offer discussion.**
