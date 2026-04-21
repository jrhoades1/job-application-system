---
name: company-research
description: >
  Research companies to build strategic intel before interviews and applications. Use
  this skill when the user says "research this company," "tell me about [Company],"
  "what should I know about [Company]," "company deep dive," "study sheet for [Company],"
  "I need to learn about [Company] before my interview," "company brief," "what do we
  know about [Company]?", or any request to learn about a company before an interview or
  application decision. Also trigger when the user says "prep me" and there is no
  company-brief.md in the application folder. This skill produces three documents: a deep
  company brief, a quick-reference study sheet, and a strategic interview plan. Do NOT
  trigger for post-interview reflection (interview-debrief), general industry research
  without a specific company, or offer evaluation (offer-evaluator).
recommended_model:
  default: sonnet
  reasoning: >
    Company research involves structured web search, fact extraction, and synthesis
    into templates. Sonnet handles this well and responds fast enough to produce all
    three documents in a single session. The templates provide structure that keeps
    output consistent.
  upgrade_to_opus_when: >
    The company is a startup with limited public information requiring inference
    from fragments, or the user wants strategic analysis of how to position against
    a specific competitor landscape, or the research reveals complex organizational
    dynamics that need nuanced interpretation for interview strategy.
---

# Company Research — Know Them Before They Know You

## Intent

1. **Research must be current, not stale** — a company that raised Series C last week is a different interview than one that did layoffs last month; always search for the latest news, not just the About page
2. **Specificity separates candidates** — "I was impressed by your growth" is forgettable; "your expansion from 200K to 1M lives managed through value-based care mirrors the scaling challenge I solved at ilumed" is memorable
3. **The JD is the richest signal** — job descriptions reveal what the company is building, what they are struggling with, and what they value; every other research source supplements the JD, not the other way around
4. **Research serves strategy, not trivia** — knowing the CEO's name is table stakes; understanding that they just pivoted from fee-for-service to value-based care and need infrastructure to support it is an interview weapon
5. **Connect every finding to the candidate** — raw company facts are useless without a bridge to achievements.md; every section of the brief should surface how the candidate's experience maps to what the company needs
6. **Study sheet must be memorizable** — if it cannot be reviewed in 10 minutes before walking into the interview, it is too long; the study sheet is a cheat sheet, not a research paper
7. **Three documents in 15-20 minutes; study sheet under 2 pages; interview plan with 3-5 strategic angles** — thorough enough to walk in prepared, concise enough to actually be used

## Why this skill exists

Going into an interview knowing only the job description is bringing a knife to a
gunfight. The company's recent moves, leadership team, tech stack, culture, and pain
points are all public information — the question is whether you do the homework. This
skill does the homework systematically: a deep brief for understanding, a study sheet
for memorization, and a strategic plan for using what you learned to stand out.

## Prerequisites

- Application folder with `metadata.json` and `job-description.md`
- `master/achievements.md` for connecting company findings to candidate strengths
- `master/narrative.md` for aligning research angles to positioning themes
- Web search capability (for current company information)

If no application folder exists, tell the user to run job-intake first — company
research without a scored JD is unfocused.

## Workflow

### Step 1: Identify the target

Which company and role? Check context. If the user mentions a company, find the
application folder. If multiple folders exist for the same company (re-application),
use the most recent.

If `company-brief.md` already exists in the folder, ask: "You already have a company
brief from [date]. Want me to refresh it with current information, or start from
scratch?"

### Step 2: Load context

Read:
- `metadata.json` — match score, gaps, keywords, status, former_employer flag
- `job-description.md` — the full posting (this is the primary research seed)
- `master/achievements.md` — for connecting research findings to candidate strengths
- `master/narrative.md` — for positioning themes relevant to this role type

### Step 3: Research the company

Use web search to gather information. Read `references/data-sources.md` for the
full checklist and red flag indicators, and `references/deep-dive-checklist.md`
for the structured "deep" mode that mirrors career-ops.

**Deep mode** (default for engineering-leadership, ai-applied, founder-minded-ic
archetypes or when the user says "deep" / "deep dive" / "really research"):
Work through `references/deep-dive-checklist.md` top-to-bottom. Produces a
structured 8-section brief with dated press releases, exec LinkedIn summaries,
tech blog themes, and a competitor landscape. Expect 8-12 searches/fetches.

**Light mode** (default for general archetype, under 30 minutes):
Tier 1 only, skip the structured deep-dive checklist. Produces a shorter
company-brief.md focused on connecting findings to achievements.

**Tier 1 — Must research (do all of these):**
- Company website: About page, leadership team, mission/values, product pages
- Recent news (last 6 months): funding rounds, acquisitions, product launches,
  leadership changes, layoffs
- The JD itself: what it reveals about team structure, tech stack, growth stage,
  and pain points

**Tier 2 — Research if available:**
- Glassdoor/Indeed: overall rating, interview process reviews, culture themes
- LinkedIn: company size, growth trajectory, key leaders, recent hires
- Crunchbase: funding history, investors, valuation, competitors

**Tier 3 — Research if the company is tech-forward (or any AI/platform archetype):**
- GitHub organization: open-source presence, tech stack signals
- Engineering blog: what they write about, architecture posts, recent themes
- Conference talks by their engineers

**For former employers** (metadata.former_employer is true): Skip general research —
the candidate already knows the company. Focus on what has changed since they left:
new leadership, new products, strategy pivots, funding events, headcount changes.

**Research notes:** As you research, keep a running list of facts that connect to
items in achievements.md. These bridges are the most valuable output.

### Step 4: Create company-brief.md

Write the deep research document in the application folder. Follow the template
in `references/research-template.md`.

The brief should cover:
- **Company Overview** — what they do, stage, size, industry
- **Leadership** — key people with backgrounds, especially likely interviewers
- **Product & Technology** — what they build, tech stack, architecture signals
- **Recent Moves** — timeline of events from the last 6 months
- **Culture & Work Environment** — Glassdoor themes, work model, engineering culture
- **Competitive Landscape** — direct competitors, market trends
- **What This Role Really Is** — read between the lines of the JD
- **Connection Points to Your Background** — table mapping their needs to achievements.md
- **Red Flags & Unknowns** — anything concerning or unverifiable

Every section should earn its space. If research turned up nothing for a section,
say so explicitly ("No engineering blog found") rather than omitting the section.

### Step 5: Create study-sheet.md

Write the quick-reference memorization document. Follow the template in
`references/research-template.md`.

**Hard constraint: under 2 pages.** This document is meant to be reviewed in the
car before walking in, or in the 5 minutes before a video call starts.

The study sheet must include:
- The company in 30 seconds (2-3 sentences — practice saying it aloud)
- Key people table (name, title, one memorable fact each)
- Their big moves (top 3, one sentence each)
- What they need from this hire (3 priorities from JD + research)
- Your top 3 bridges (their need → your achievement + number)
- Smart things to say (phrases that demonstrate research naturally)
- Smart things to ask (company-specific questions, not generic)
- Numbers to have ready (achievements mapped to company relevance)

### Step 6: Create interview-plan.md

Write the strategic planning document. Follow the template in
`references/research-template.md`.

This bridges research to execution — it is about **how to use what you learned**:
- **Strategic Positioning** — which differentiator to lead with for THIS company
- **Anticipated Interview Focus** — what they will care about, probe, and test
- **Company-Specific Talking Points** — achievements tied to company needs, with
  "Drop this when" trigger conditions for each
- **Gap Strategy** — for each gap from match_score, how important is it to this
  company specifically, and how to bridge it
- **Questions That Show Homework** — reference specific findings, not generic templates
- **Signals to Watch** — what to pay attention to during the interview

### Step 7: Update metadata and present

Update `metadata.json`:
- Set `company_research_file` to `"company-brief.md"`

Present a summary to the user:
1. **Key findings** — 3-4 most important things discovered
2. **Strategic angles** — how the research changes positioning
3. **Red flags** — anything concerning (or "none identified")
4. **Recommendation** — "Review the study sheet before your interview" or "The
   brief is ready — want to run interview-prep-builder now to build your full
   prep package?"

Offer to chain into interview-prep-builder, which will consume this research.

## Edge cases

- **No web search available** — Build the brief from the JD alone. Be explicit
  about what is JD-derived versus independently verified. Flag that the brief
  should be supplemented when search is available.
- **Startup with minimal public information** — Note what could not be found. This
  itself is a data point (stealth mode, early stage). Convert unknowns into
  interview questions in the study sheet and interview plan.
- **Company the user already knows well (former employer)** — Focus the brief on
  what changed since they left. The study sheet should cover new leadership,
  products, and strategy pivots, not basics. The interview plan should address
  the "why are you coming back?" angle.
- **Multiple roles at the same company** — Create one company-brief.md shared
  across roles. The study-sheet.md and interview-plan.md are role-specific.
- **Research reveals dealbreakers** — If research surfaces major red flags (mass
  layoffs, lawsuits, terrible Glassdoor), say so directly. The research should
  inform a "should I still pursue this?" conversation, not just prep.
- **Company brief already exists but is stale** — If the brief is more than 30
  days old, recommend a refresh. Recent news changes the strategic picture.

## Skill composition

| Upstream | This skill | Downstream |
|----------|-----------|------------|
| job-intake (application folder, JD, match score) | **company-research** (intel gathering) | interview-prep-builder (richer talking points) |
| | | cover-letter-writer (company-specific hooks) |
| | | offer-evaluator (company intel for negotiation) |

Read `references/research-template.md` for output templates and `references/data-sources.md` for the research checklist.
