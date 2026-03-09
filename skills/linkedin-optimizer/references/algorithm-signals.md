# LinkedIn Algorithm Signals

> How LinkedIn's recommendation engine decides which jobs to show you.
> Updated based on 2025-2026 algorithm behavior research.

## How the Algorithm Works

LinkedIn uses a multi-stage recommendation pipeline:

1. **Candidate Generation** — Broad retrieval based on profile text, skills, and job preferences
2. **Ranking** — ML model scores each candidate-job pair on relevance, using hundreds of features
3. **Fairness Re-ranking** — Adjusts for diversity signals (prevents echo-chamber recommendations)
4. **Delivery** — Routes to email digests, app notifications, and feed cards

You can influence stages 1 and 2. Stage 3 is opaque. Stage 4 is controlled by notification settings.

## Profile Fields by Algorithm Weight

| Field | Weight | How It's Used |
|-------|--------|---------------|
| **Headline** | Highest | Primary text for semantic matching. Most indexed field. |
| **Current job title** | Highest | Drives seniority inference. Must contain exact level keywords. |
| **Open to Work titles** | High | Overrides inferred titles when set. Up to 5. |
| **Skills section** | High | Matched against job posting "skills" tags. Clusters matter more than individual skills. |
| **About section** | High | NLP-parsed for domain expertise, leadership scope, technical depth. |
| **Experience bullets** | High | Confidence scoring — claims with metrics are weighted higher. |
| **Endorsements** | Medium | Social proof multiplier on skills. More endorsements = higher skill confidence. |
| **Recommendations** | Medium | Parsed for leadership and domain signals. |
| **Education** | Medium | More relevant for early career. Certifications indexed separately. |
| **Activity/posts** | Low-Medium | Builds "topic authority." Consistent posting on a topic increases related recommendations. |
| **Connections** | Low | Weak signal — mostly affects "people in your network also viewed" recommendations. |

## Seniority Inference

LinkedIn assigns a seniority code to your profile. **You cannot set this manually.** It is inferred from:

1. **Current job title text** — "Director," "VP," "Head of," "Chief" all map to specific codes
2. **Years of experience** — Total time across all roles
3. **Team management signals** — Mentions of team size, hiring, reporting structure
4. **Company size** — Same title at a 50-person startup vs. Fortune 500 may infer differently

### Seniority codes (from LinkedIn's reference tables):
| Code | Level | Title Signals |
|------|-------|---------------|
| 1 | Unpaid | Intern, Volunteer |
| 2 | Training | Trainee, Apprentice |
| 3 | Entry | Junior, Associate, Analyst |
| 4 | Mid-Senior | Senior, Lead, Staff, Manager |
| 5 | Director | Director, Senior Director, Head of |
| 6 | VP | Vice President, SVP, EVP |
| 7 | CXO | CTO, CIO, CEO, Chief |
| 8 | Partner | Partner, Managing Partner |
| 9 | Owner | Founder, Owner, Co-founder |

**If your profile is being classified as level 4 (mid-senior) instead of 5 (Director), you'll get mid-level recommendations.** Fix: ensure current title contains "Director" or "VP" explicitly.

## Semantic Entity Mapping (Knowledge Graph)

Since 2024, LinkedIn uses a Knowledge Graph with 38,000+ standardized skills. Your profile text is mapped to entities in this graph, not matched as raw keywords.

**Implication:** "Engineering Leadership" is a different entity from "Software Engineering" — having one doesn't imply the other. You need both if you want to match both types of postings.

### Semantic clusters for Director-level engineering:

**Leadership cluster entities:**
- Engineering Leadership, Technical Strategy, Organizational Design
- Cross-functional Alignment, Executive Communication, Headcount Planning
- Agile Transformation, Engineering Excellence, Talent Development
- Strategic Planning, Program Management, Stakeholder Management

**Technical cluster entities:**
- System Architecture, Platform Engineering, Cloud Infrastructure
- Microservices Architecture, API Design, Data Engineering
- AI/ML Integration, DevOps, CI/CD, Performance Engineering
- Security Architecture, Distributed Systems

**Healthcare cluster entities (domain-specific):**
- Healthcare IT, HIPAA, FHIR, HL7, EHR Integration
- Clinical Workflows, Value-Based Care, Population Health
- Medical Devices, FDA Compliance, Interoperability
- Claims Processing, Revenue Cycle Management

**Rule:** Skills within a cluster reinforce each other. Isolated skills (one skill from a cluster without its neighbors) are treated as shallow expertise.

## Behavioral Signals

### Positive signals (train algorithm toward more of this):
| Action | Strength | Cooldown |
|--------|----------|----------|
| Apply via LinkedIn | Strongest | Immediate |
| Save a job posting | Strong | Immediate |
| Click into a job and spend 30+ seconds | Medium | Batched daily |
| Search for specific titles | Medium | Batched daily |
| Follow a company | Medium | 24-48 hours |
| Engage with domain content | Low-Medium | Accumulates over weeks |

### Negative signals (train algorithm away from this):
| Action | Strength |
|--------|----------|
| Click "Not interested" on a recommendation | Strong |
| Dismiss a notification | Medium |
| Never clicking into a category of jobs | Weak (passive) |

### Anti-patterns (accidentally train algorithm wrong):
| Action | Problem |
|--------|---------|
| Clicking into every notification | Registers positive signal for irrelevant roles |
| Searching for roles you're curious about but won't take | Trains recommendations toward those roles |
| Applying to "easy apply" roles below your level | Strongest signal — will flood you with similar roles |
| Having broad/vague skills like "Management" | Algorithm can't disambiguate your domain |

## Recommendation Email vs. Alert Email

These are **two different systems:**

| | Job Alerts | Job Recommendations |
|---|-----------|-------------------|
| **Source** | Your saved search query | LinkedIn's inference engine |
| **Filters** | Your explicit filters | None — uses profile + behavior |
| **Control** | Full (you set the query) | Minimal (profile optimization only) |
| **Email toggle** | Per-alert on/off | Global on/off |
| **Quality** | High (if alerts are well-configured) | Variable (depends on profile accuracy) |

**Recommendation:** Turn off recommendation emails. Keep only alert emails. This gives you full control over what reaches your inbox.

## Timeline for Changes

After making profile or preference changes:
- **Immediate:** Saved job alert results update on next email cycle
- **24-48 hours:** Job recommendation engine re-indexes your profile
- **1-2 weeks:** Behavioral signal retraining takes effect
- **Ongoing:** Topic authority from content engagement builds over months

## Sources

1. LinkedIn Knowledge Graph documentation (Microsoft Learn)
2. LinkedIn seniority reference tables (learn.microsoft.com/linkedin/shared/references)
3. LinkedIn Help: "Jobs Recommended for You" (linkedin.com/help/linkedin/answer/a512279)
4. Jobright analysis of LinkedIn's 2025-2026 semantic matching (jobright.ai/blog)
5. BrainForge analysis of LinkedIn AI matching pipeline (brainforge.ai/blog)
