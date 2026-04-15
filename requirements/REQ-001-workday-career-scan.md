---
id: REQ-001
name: Workday ATS support for career-scan
status: proposed
priority: high
owner: jimmy
created: 2026-04-15
---

# Workday ATS support for career-scan

## Problem

The `target_companies` / career-scan feature currently only supports Greenhouse
(`detectVendor` in `src/career-scan/detect-vendor.ts`). This blocks ~70% of
Jimmy's actual healthcare target universe — all major payers (Optum, Humana,
Cigna, Elevance, CVS/Aetna, Molina) and many large health systems (Baptist
Health SF) run Workday.

See blocked list in
`jimmys-plan/context/target-healthcare-companies.md` → "Not yet scannable".

## Goal

Allow a user to paste a Workday careers URL (e.g.
`https://humana.wd5.myworkdayjobs.com/Humana_External_Career_Site`) and have
it scanned on the same nightly cron as Greenhouse boards.

## Acceptance criteria

- [ ] `detectVendor` recognizes Workday URLs and extracts tenant + site
- [ ] `src/career-scan/vendors/workday.ts` implements `scanWorkday()` matching
      the `scanGreenhouse()` contract
- [ ] Workday CxS JSON search API used (POST to
      `/{tenant}/{site}/jobs` with `appliedFacets`, `limit`, `offset`)
- [ ] `POST /api/target-companies` accepts Workday URLs (remove the
      hardcoded `vendor !== "greenhouse"` rejection)
- [ ] Nightly cron (`/api/cron/nightly-pipeline`) handles Workday entries
- [ ] At least 3 real Workday targets verified end-to-end (Humana, Optum,
      CVS Health)
- [ ] Unit tests for URL parsing + vendor dispatch

## Out of scope

- iCIMS, Lever, Ashby support (separate requirements when needed)
- Auth-gated boards (some Workday instances require login)

## Open questions

- Rate limiting: Workday CxS API has aggressive throttling. Do we need to
  stagger scans across the cron window?
- Deduplication: Workday job IDs are stable but postings sometimes get
  re-posted with new IDs. Match on title + location + req ID?
