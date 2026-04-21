# Deep Dive Checklist — career-ops Parity

Structured research flow mirroring career-ops's `deep` mode. Use this when the
user asks for a deep dive, or by default when `metadata.archetype` is one of:
- engineering-leadership
- ai-applied
- founder-minded-ic
- platform-sre (for infra-heavy companies)

Work through sections top-to-bottom. Each section has the query to run and
what to extract.

## Section 1 — Funding & Financial Snapshot

**Queries:**
- WebSearch: `"{company}" Series A Series B Series C funding round`
- WebSearch: `"{company}" latest funding announcement`
- WebFetch: Crunchbase `https://www.crunchbase.com/organization/{slug}`

**Extract (structured):**
- Total raised to date ($M)
- Last round: date, amount, series, lead investor, valuation
- Next round timing signal (public statements about burn / need)
- Investor list (top 3 tier-1 VCs if any)

**Output format:**
```
FUNDING
  Total raised: $X M
  Last round: {date} · Series X · ${amount} · led by {investor} · {post-money valuation}
  Investors: {top 3}
  Burn signal: {public statement or "unknown"}
```

## Section 2 — Last 3 Press Releases / Announcements

**Queries:**
- WebSearch: `"{company}" news announcement site:techcrunch.com OR site:businesswire.com`
- WebSearch: `"{company}" press release 2026`
- Check company's /press or /news page via WebFetch if they have one

**Extract:** Exact date + headline + one-sentence summary for each of the 3 most
recent. Older than 12 months → skip.

**Output format:**
```
PRESS
  {YYYY-MM-DD} · {headline}
    → {one sentence on what this means strategically}
  {YYYY-MM-DD} · {headline}
    → {one sentence}
  {YYYY-MM-DD} · {headline}
    → {one sentence}
```

## Section 3 — Leadership Snapshot (LinkedIn-sourced)

**Targets:** CEO, CTO/VP Eng, hiring manager (if known from JD or email)

**Queries:**
- WebSearch: `"{name}" "{company}" linkedin site:linkedin.com`
- WebFetch the LinkedIn URL if public

**Extract per person:**
- Current role + tenure at company
- Previous 2 roles (companies + titles)
- Total years of experience in the space
- Education (if notable)
- One observation that's useful for the interview ("former founder", "12 years
  at Amazon before this", "published on X")

**Output format:**
```
LEADERSHIP
  {Name} — {Role} · {N yr at company}
    Previously: {prev role 1}, {prev role 2}
    Observation: {one useful line}
```

## Section 4 — Tech Blog Themes (for tech-forward archetypes)

**Queries:**
- WebFetch: `https://{company}.com/blog` or `https://engineering.{company}.com`
- If nothing found: WebSearch `"{company}" engineering blog`

**Extract:**
- Last 5 post titles with dates
- Dominant themes (3-5 recurring topics)
- Tech-stack signals (languages, frameworks, infra choices revealed)
- Who is writing (internal engineers vs marketing)

**Output format:**
```
ENGINEERING BLOG
  URL: {url}
  Last posts:
    - {date} · {title}
    - {date} · {title}
    ...
  Themes: {3-5 themes}
  Stack signals: {languages/frameworks mentioned}
```

## Section 5 — Product Deep Dive

**Queries:**
- WebFetch the company's product pages (/product, /platform)
- WebSearch: `"{company}" demo OR case study`

**Extract:**
- Core product(s) in one sentence each
- Key customers mentioned (top 5)
- Pricing model (if disclosed)
- Competitive positioning statements

## Section 6 — Competitive Landscape

**Queries:**
- WebSearch: `"{company}" vs OR alternative OR competitor`
- WebSearch: `"{company}" competitive landscape`

**Extract (top 3):**
- Competitor name
- How the target company positions against them (if stated)
- Who's winning in the current cycle

**Output format:**
```
COMPETITORS
  1. {name} — {positioning difference} · {cycle winner}
  2. {name} — ...
  3. {name} — ...
```

## Section 7 — Culture & Interview Signal

**Queries:**
- WebSearch: `"{company}" glassdoor reviews interview experience`
- WebSearch: `"{company}" interview process "{role type}"`

**Extract:**
- Overall Glassdoor rating (if 50+ reviews)
- Top 3 pros and top 3 cons from reviews
- Interview stages (phone → technical → onsite / bar raiser / etc.)
- Rumored difficulty / timeline

## Section 8 — Risk Flags

Scan for any of the following and note severity (low / medium / high):

- Layoffs in last 12 months
- Founder/exec departures in last 6 months
- Litigation or regulatory action (data breach, SEC, DOJ)
- Product cancellations or roadmap pivots that cut the team you'd join
- Glassdoor rating < 3.0 with recurring cons
- Public revenue decline or missed guidance (for public cos)

**Output format:**
```
RISK FLAGS
  [high/medium/low] {flag} — {one sentence of context}
  ...
  (or "No material risk flags identified.")
```

## Synthesis Instructions

After completing all 8 sections, produce `company-brief.md` with:
1. All 8 structured sections above, verbatim format
2. A "Connection to candidate" subsection at the end of each section that
   references specific lines from `master/achievements.md` (cite by full line,
   not paraphrase)
3. An "Interview opening line" at the top — one sentence the candidate can open
   with that proves they did the research and connects to their experience

Example opening line:
> "I noticed you shipped the agent-safety framework last month — the Stage 2
> evaluator work I did at ilumed hit similar offline-replay gotchas, which
> would translate directly to your environment."

## When to skip sections

- Section 4 (Tech Blog): skip if archetype is engineering-leadership and the
  company is not technical-product-first (e.g., bank, hospital)
- Section 6 (Competitors): skip if company is a solo-category player
- Section 8 (Risk): NEVER skip — always produce this section even if empty
