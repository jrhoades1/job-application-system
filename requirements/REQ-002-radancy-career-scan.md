---
id: REQ-002
name: Radancy / TalentBrew ATS support for career-scan
status: proposed
priority: high
owner: jimmy
created: 2026-04-17
updated: 2026-04-17
---

# Radancy / TalentBrew ATS support for career-scan

## Problem

UHG / Optum is Jimmy's largest blocked healthcare target (440k employees) but
their public careers site (`careers.unitedhealthgroup.com`) doesn't run on
Workday, iCIMS, or any vendor currently supported by `detectVendor`. It runs
on **Radancy's TalentBrew / Magic Bullet** platform (confirmed via page
markup: `data-cdnv="//tbcdn.talentbrew.com/"`, `radancy-magicbullet`).

Radancy sites use the company's own hostname (no shared subdomain like
`boards.greenhouse.io`), so URL-pattern detection alone can't classify them.

## Goal

User pastes any Radancy careers URL; the system identifies it as Radancy,
extracts a `{hostname}/{company-site-id}` composite identifier, and scans
it on the same hourly cron as Greenhouse / Workday with filter behavior
unchanged.

## Acceptance criteria

### Detection + data model

- [ ] `POST /api/target-companies` calls sync `detectVendor()` first; when
      it returns null, falls back to an async Radancy probe
      (`detectRadancyAsync(url)`) that GETs the URL, looks for
      `tbcdn.talentbrew.com` / `data-company-site-id` markers, and extracts
      the site ID.
- [ ] `ats_identifier` stores `{hostname}/{companySiteId}` (no schema
      migration — already `TEXT`).
- [ ] Supported-vendor set in the POST route includes `radancy`.

### Primary path: `/search-jobs/results` JSON API

- [ ] `apps/web/src/career-scan/vendors/radancy.ts` implements
      `scanRadancy(identifier): Promise<JobListing[]>`.
- [ ] GETs `https://{hostname}/search-jobs/results?CurrentPage=N&RecordsPerPage=100&SearchType=5&OrganizationIds=` etc.
- [ ] Parses the `results` HTML chunk:
      - `data-total-results`, `data-total-pages`, `data-current-page`
      - Per-job `<li><a href="/job/{slug}/{companySiteId}/{jobId}" data-job-id="{jobId}">`
      - Within each: `<h2>` title, `<span class="job-id">` external display ID, `<span class="job-location">`
- [ ] `JobListing.externalId` = `data-job-id` value (stable across reposts).
- [ ] Paginates via `CurrentPage` until `data-current-page` >= `data-total-pages`
      or hard cap (100 pages × 100/page = 10,000 listings).
- [ ] 429 responses: retry once with 5s backoff. Second 429 marks run failed.
- [ ] Non-JSON response → marks run failed with `last_error = "Radancy API shape changed"`.

### Rate limiting

- [ ] Career-scan cron inserts 1.5s sleep between consecutive Radancy tenant
      calls (same as Workday). Per-tenant in-memory 429 skip for the rest
      of the run.

### Filtering

- [ ] Radancy scans use `evaluateStage1(..., { strict: true })` via the
      existing cron loop — vendor-agnostic. Verified via existing dispatch
      test pattern.

### Tests

- [ ] Recorded-fixture test for `scanRadancy()`:
      - Happy path: 2 pages of results → flattens to 1 `JobListing[]`
      - Empty board: `hasJobs: false` → returns `[]`
      - Malformed HTML: missing `data-total-results` → throws
      - 429 once → backoff succeeds
      - 429 twice → throws `RadancyRateLimitError`
- [ ] Unit test for `detectRadancyAsync()`: fetches markup with
      `data-company-site-id="67476"` and returns the site ID.

### Rollout

- [ ] UHG added end-to-end and produces a non-empty snapshot on first scan.
- [ ] `career_scan_runs` row with finite `finished_at` and `status = "success"`.

## Out of scope

- Greenhouse/Workday-style facet filtering at the API level (Radancy accepts
  Keywords/Location/OrganizationIds, but shipping with no filter is fine
  given Stage 1 strict runs on every listing anyway).
- Proxy rotation / auth-gated Radancy sites (haven't encountered any).
- Generic "unknown vendor" LLM-extract fallback — separate REQ if needed.

## Implementation notes

**No CSRF.** `/search-jobs/results` is a plain GET that returns
`application/json`. Tested against UHG (`data-company-site-id=67476`):
5,560 total jobs, 371 pages at default 15/page.

**HTML parsing inside JSON.** The `results` field is a string of HTML. Use
regex (not a full DOM parser) — the markup is stable enough and we only
need ~4 fields per job. Keeps the dep surface small and avoids introducing
jsdom or cheerio.

**Identifier stability.** `data-company-site-id` is a short numeric ID that
never changes for a tenant. Safe as part of the composite identifier.
