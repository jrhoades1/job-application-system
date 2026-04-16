---
id: REQ-001
name: Workday ATS support for career-scan
status: proposed
priority: high
owner: jimmy
created: 2026-04-15
updated: 2026-04-15
---

# Workday ATS support for career-scan

## Problem

The `target_companies` / career-scan feature currently only supports Greenhouse
(`detectVendor` in `apps/web/src/career-scan/detect-vendor.ts`). This blocks
~70% of Jimmy's actual healthcare target universe -- all major payers (Optum,
Humana, Cigna, Elevance, CVS/Aetna, Molina) and many large health systems
(Baptist Health SF) run Workday.

See blocked list in
`jimmys-plan/context/target-healthcare-companies.md` -> "Not yet scannable".

## Goal

Allow a user to paste a Workday careers URL and have all 6 major payers
scanned on the same daily cron as Greenhouse boards, with filter behavior
unchanged. Where the Workday CxS API fails (CSRF refusal, HTML-only response,
auth gate), fall back to LLM-extraction on the rendered HTML so no target
is silently dropped.

Filter behavior is vendor-agnostic: Workday scans inherit
`evaluateStage1(strict=true)` from `/api/cron/career-scan` automatically via
the dispatcher pattern. Do NOT re-implement filtering per vendor.

## Acceptance criteria

### URL parsing + data model

- [ ] `detectVendor` extracts **tenant** AND **site** from all known Workday
      URL shapes:
      - `{tenant}.wd{N}.myworkdayjobs.com/{site}`
      - `{tenant}.wd{N}.myworkdayjobs.com/en-US/{site}` (and other locales)
      - `wd{N}.myworkdaysite.com/recruiting/{tenant}/{site}/...` (newer)
- [ ] `ats_identifier` stores tenant+site as a composite slug:
      `{tenant}/{site}` (e.g. `humana/Humana_External_Career_Site`).
      No schema migration required -- `ats_identifier` is already `TEXT`.
- [ ] `POST /api/target-companies` removes the hardcoded
      `vendor !== "greenhouse"` rejection in
      `apps/web/src/app/api/target-companies/route.ts`.

### Primary path: Workday CxS API

- [ ] `apps/web/src/career-scan/vendors/workday.ts` implements
      `scanWorkday(identifier: string): Promise<JobListing[]>` matching the
      `scanGreenhouse()` contract.
- [ ] Session-preserving fetch helper that:
      1. `GET`s the careers landing page (`/{tenant}/{site}`) to establish
         session cookies + capture the CSRF token (`X-Calypso-CSRF-Token-*`
         header or embedded `csrfToken` in the HTML).
      2. `POST`s to `/wday/cxs/{tenant}/{site}/jobs` with JSON body
         `{"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""}`,
         forwarding cookies + CSRF + proper `Origin` and `Referer` headers.
      3. Paginates via `offset` until `total` is reached or hard cap
         (500 listings per scan) is hit.
- [ ] `JobListing.externalId` maps to `externalPath` (stable, e.g.
      `/job/Louisville-KY/Senior-Manager/R-345678`), NOT the random `id`
      field. Handles Workday's occasional repost-with-new-id behavior.
- [ ] 429 responses are retried once with 5s backoff. Second 429 marks the
      run `failed` with `error_message = "Workday rate limited"`.
- [ ] Non-JSON response (HTML, redirect to auth page) does NOT throw -- it
      triggers the LLM fallback path below.

### Fallback path: LLM extraction

- [ ] When CxS API returns non-JSON, `scanWorkday()` fetches the rendered
      HTML of the careers landing page (`GET {tenant}/{site}`) and invokes
      a new helper `extractJobsFromHtml(html, company)` in
      `apps/web/src/career-scan/llm-extract.ts`.
- [ ] `extractJobsFromHtml` uses Claude Haiku (cheapest model) with a
      structured prompt returning JSON array matching `JobListing[]`. Max
      response ~4KB, capped at 50 listings per page.
- [ ] LLM extraction is logged to `ai_generations` via the existing
      `createTrackedMessage` wrapper so it shows up in Cost & Usage.
- [ ] LLM fallback is opt-in per target via a new boolean column
      `target_companies.allow_llm_fallback` (default true, migration 014).
- [ ] Hard cost cap: if the user's monthly AI spend is above the config
      ceiling, LLM fallback skips with `last_error = "AI budget exceeded"`
      and the target is not scanned that day.

### Rate limiting

- [ ] Career-scan cron inserts `await sleep(1500)` between consecutive
      Workday vendor calls (regardless of success/fail). Greenhouse calls
      remain unthrottled.
- [ ] Per-tenant rate limit is tracked in-memory within a single cron
      invocation (no persistence). A tenant that 429s is skipped for the
      rest of the run.

### Auth-gated boards

- [ ] A Workday board that requires login (CxS returns 401/403 or the
      landing HTML contains a sign-in form) is NOT silently treated as
      "zero jobs." Sets `target_companies.last_error = "Auth required --
      remove this target"` so the user knows to act.
- [ ] Auth-required detection: `GET {tenant}/{site}` HTML contains
      `<form[^>]+login` OR returns 401/403 on either GET or POST.

### Filtering

- [ ] Workday scans use `evaluateStage1(..., { strict: true })` via the
      existing career-scan cron loop. No changes to `lead-filter.ts`.
      Verify via unit test that a Workday-sourced `JobListing` flows
      through the same filter path.

### Tests

- [ ] Unit tests for `detectVendor` covering all 3 Workday URL shapes
      (legacy, localized, myworkdaysite.com). Extend existing
      `tests/career-scan/detect-vendor.test.ts`.
- [ ] Recorded-fixture test for `scanWorkday()` covering:
      - Happy path (CSRF + JSON pagination)
      - CSRF token missing -> retry once then fail
      - 429 on first request -> backoff succeeds
      - 429 twice -> marks run failed
      - Non-JSON response -> triggers LLM fallback (mocked)
      - Auth-gated board -> sets `last_error`
- [ ] Recorded-fixture test for `extractJobsFromHtml()` with a captured
      Humana/Optum HTML snippet. LLM call mocked with a fixed response.
- [ ] Unit test verifying Stage 1 strict filter applies identically to
      Greenhouse and Workday `JobListing`s (dispatch test).

### Rollout

- [ ] All 6 payers added as targets end-to-end and verified:
      - Humana (`humana.wd5.myworkdayjobs.com/Humana_External_Career_Site`)
      - Optum (UnitedHealth Group Workday tenant)
      - Cigna
      - Elevance Health
      - CVS Health / Aetna
      - Molina Healthcare
- [ ] Per-payer result row in `career_scan_runs` with finite
      `finished_at` timestamp and no `failed` status.
- [ ] Manual scan trigger produces a non-empty `pipeline_leads` count for
      at least 4 of 6 payers (allowing for LLM fallback variance and
      potential auth gating on 1-2).

## Implementation notes

**Build order (reduces blast radius):**
1. URL parsing + `ats_identifier` composite -> schema unblocks target add
2. CxS primary path against Humana as the first tenant
3. Rate limiting + 429 retry wrapper
4. Migration 014 `allow_llm_fallback` column
5. LLM extraction fallback with cost cap
6. Auth-gate detection
7. Add remaining 5 payers + end-to-end verification
8. Tests in parallel throughout (no PR without the recorded-fixture tests)

**Session handling:** Use `undici.Agent` with a cookie jar, not raw `fetch`.
The Web Fetch API in Next.js App Router does not persist cookies across
calls by default -- you will fight invisible session drops if you try.

**LLM prompt shape for fallback:** Give Claude Haiku the `<body>` slice of
the page (first 8KB) and ask for `{jobs: [{title, location, url, department?}]}`
in strict JSON. Validate with Zod. Reject the whole response if any required
field is missing rather than partial-parsing.

**Cost estimate for LLM fallback:** Haiku at ~$0.25/M input, 8KB page
input ~ 2K tokens -> $0.0005 per scan per fallback-triggered target. 6
payers x 30 days x $0.0005 = $0.09/month worst case. Negligible.

## Out of scope

- iCIMS, Lever, Ashby support (separate requirements when needed)
- Persistent per-tenant rate-limit budget (in-memory per-run is enough)
- Proxy rotation / IP cycling for heavily-throttled tenants
- Scraping beyond the careers landing page (individual JD pages are
  captured by the Chrome extension, not career-scan)

## Decisions

Resolved open questions from the original proposal:

1. **Scope of first delivery:** all 6 payers at once, not a Humana pilot.
   Pilot would delay value by 1-2 weeks with no real de-risking -- the hard
   parts (CSRF, cookies, rate limits) are the same whether we ship 1 tenant
   or 6.
2. **HTML/JSON fallback behavior:** try LLM-extraction on the rendered page,
   do NOT fail fast. Cost is negligible ($0.09/month worst case) and without
   it the Optum/CVS tenants would be dead weight if their CxS endpoint
   returns HTML instead of JSON.
3. **Deduplication strategy:** use `externalPath` from CxS response as the
   stable external ID. This survives Workday's occasional repost-with-new-id
   behavior because the path includes the requisition number (e.g. R-345678).
4. **Rate limiting:** 1.5s delay between Workday calls, in-memory 429 skip.
   No persistent rate budget needed at this volume.

## Risks

- **Workday CSRF mechanism has changed once in the last 2 years.** If
  Workday rolls another auth scheme mid-build, the primary path breaks and
  everything falls to LLM extraction until fixed. Mitigation: LLM fallback
  is in-scope so we ship useful even if CxS goes dark.
- **LLM fallback accuracy is not 100%.** Haiku occasionally hallucinates
  a title or misreads a location. Mitigation: Stage 1 strict filter runs
  on the LLM output just like the API output, so hallucinated
  non-engineering roles get rejected anyway.
- **One tenant's rate limit can stall the whole cron run** because the
  loop is sequential. Mitigation: hard per-tenant timeout (30s) + the
  in-memory 429 skip above.
