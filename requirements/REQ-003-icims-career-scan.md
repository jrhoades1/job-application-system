---
id: REQ-003
name: iCIMS ATS support for career-scan
status: proposed
priority: medium
owner: jimmy
created: 2026-04-17
updated: 2026-04-17
---

# iCIMS ATS support for career-scan

## Problem

iCIMS is used by 4,400+ companies (a quarter of the Fortune 500). The
existing `detectVendor` regex already recognizes `careers-{slug}.icims.com`
URLs, but the dispatcher throws `Vendor 'icims' not implemented yet`.

Unlike Workday or Radancy, iCIMS tenants vary wildly in their public
markup. Some return an HTML jobs list; some proxy through to the
customer's WordPress / SPA; some are auth-gated. No single-shape API.

## Goal

Best-effort scan of any `careers-{slug}.icims.com` careers portal. When
the markup cooperates, parse jobs directly. When it doesn't, use the
existing LLM-extract fallback (same helper as Workday).

## Acceptance criteria

### URL parsing + data model

- [x] `detectVendor` already catches `careers-{slug}.icims.com` (no change).
- [ ] `POST /api/target-companies` supported-vendor set includes `icims`.
- [ ] Naming: human-readable company name derived from the slug when no
      explicit name is provided.

### Primary path: HTML parse of `/jobs/search`

- [ ] `apps/web/src/career-scan/vendors/icims.ts` implements
      `scanIcims(identifier, context?): Promise<JobListing[]>`.
- [ ] GETs `https://careers-{slug}.icims.com/jobs/search?ss=1`.
- [ ] Attempts to extract `<a href="https://careers-{slug}.icims.com/jobs/{jobId}/{slug}"...>`
      links plus nearby title / location text.
- [ ] When fewer than 3 jobs are extracted via regex OR the HTML shows
      strong SPA signals (no `<li>` job elements at all), falls back to
      `extractJobsFromHtml()` via `ScanContext.allowLlmFallback`.

### Fallback path: LLM extraction

- [ ] Reuses `apps/web/src/career-scan/llm-extract.ts`. No new AI helper.
- [ ] Cost-capped via existing `createTrackedMessage` wrapper. If monthly
      AI spend is over the cap, the scan returns `[]` and sets
      `last_error = "AI budget exceeded"`.
- [ ] LLM gets the first 8KB of the body slice, same as Workday fallback.

### Auth-gated boards

- [ ] 401/403 on GET → throws `IcimsAuthError` (mirroring `WorkdayAuthError`).
      Cron catches and sets `last_error = "Auth required -- remove this target"`.

### Rate limiting

- [ ] Career-scan cron inserts 1s sleep between consecutive iCIMS calls.
      Lighter than Workday (1.5s) because iCIMS tends to be less aggressive.
- [ ] Per-tenant in-memory 429 skip for the rest of the run.

### Filtering

- [ ] Stage 1 strict filter runs identically to Greenhouse / Workday /
      Radancy via the vendor-agnostic cron loop.

### Tests

- [ ] Recorded-fixture test for `scanIcims()`:
      - Happy path: HTML with 10 job `<a>` links → flattens to 10 listings
      - SPA page (no job anchors) → falls to LLM fallback (mocked)
      - 401 response → `IcimsAuthError`
      - LLM fallback disabled + no jobs → returns `[]` (no error)

### Rollout

- [ ] At least one iCIMS target added end-to-end — candidate: Healthcare
      Services Group (`careers-hcsgcorp.icims.com`), Acadia Healthcare,
      Prime Healthcare, or Cotiviti.

## Out of scope

- iCIMS's documented OAuth 2.0 Portal API (requires customer credentials
  per tenant — infeasible for a scrape use case).
- Bypass of heavy JS SPAs that need a real browser to render (stick to
  LLM fallback; no headless Chrome).
- iCIMS Standard XML Feed (`Job Feed Service`) — requires approved vendor
  registration.

## Risks

- **Variable markup across tenants** means the primary-path extraction
  will miss some boards. LLM fallback mitigates but isn't free.
- **LLM hallucination risk** — Stage 1 strict filter on the output catches
  most garbage; same posture as Workday LLM fallback.

## Reality check (2026-04-17)

Probed 5 real iCIMS tenants (`hcsgcorp`, `primehealthcare`, `cotiviti`,
`acadiahealthcare`, and a handful of 404s). **None** expose a
server-rendered job list in the landing HTML. They're all SPAs that
load job data client-side via JS calls to iCIMS internal endpoints that
require a session cookie.

This means the primary path (`scanIcims` direct regex parse) will return
0 jobs on most tenants. LLM fallback on an SPA shell also extracts
nothing because the initial HTML has no job data to extract.

**Honest status:** iCIMS support as shipped is best-effort. A tenant
that happens to server-render jobs (older / smaller customers) will be
picked up. Broader coverage would require headless-browser rendering
(out of scope for this REQ).

The code paths are safe — no errors, just empty results, `last_scanned_at`
still advances, the target row doesn't gum up the cron queue.
