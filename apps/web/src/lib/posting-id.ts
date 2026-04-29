/**
 * Mirror of the Postgres `public.extract_posting_id` function (migration 016).
 * Both must stay in sync — the DB trigger auto-populates on insert/update,
 * but the sync path uses this helper to pre-check for duplicates before
 * calling AI extraction or scoring.
 */
export function extractPostingId(url: string | null | undefined): string | null {
  if (!url) return null;

  // LinkedIn — /jobs/view/<id>/ (accepts /comm/ prefix) or ?currentJobId=<id>
  if (/linkedin\.com/i.test(url)) {
    const viewMatch = url.match(/linkedin\.com[^\s]*\/(?:comm\/)?jobs\/view\/(\d+)/i);
    if (viewMatch) return `linkedin:${viewMatch[1]}`;
    const currentMatch = url.match(/[?&]currentJobId=(\d+)/i);
    if (currentMatch) return `linkedin:${currentMatch[1]}`;
    return null;
  }

  // Greenhouse — boards.greenhouse.io/<board>/jobs/<id>
  if (/greenhouse\.io/i.test(url)) {
    const m = url.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i);
    if (m) return `greenhouse:${m[1]}:${m[2]}`;
    return null;
  }

  // Ashby — jobs.ashbyhq.com/<org>/<uuid>
  if (/ashbyhq\.com/i.test(url)) {
    const m = url.match(/ashbyhq\.com\/([^/?#]+)\/([a-f0-9][a-f0-9-]{7,})/i);
    if (m) return `ashby:${m[1]}:${m[2]}`;
    return null;
  }

  // Lever — jobs.lever.co/<org>/<uuid>
  if (/lever\.co/i.test(url)) {
    const m = url.match(/lever\.co\/([^/?#]+)\/([a-f0-9][a-f0-9-]{7,})/i);
    if (m) return `lever:${m[1]}:${m[2]}`;
    return null;
  }

  // Workday — <sub>.myworkdayjobs.com/<site>/job/<loc>/<slug>_<reqid>
  if (/myworkdayjobs\.com/i.test(url)) {
    const m = url.match(/myworkdayjobs\.com\/[^/]+(?:\/[^/]+)?\/job\/[^/]+\/([^/?#]+)/i);
    if (m) return `workday:${m[1]}`;
    return null;
  }

  // Built In — builtin.com/job/<slug>/<id>
  if (/builtin\.com\/job\//i.test(url)) {
    const m = url.match(/builtin\.com\/job\/[^/]*\/(\d+)/i);
    if (m) return `builtin:${m[1]}`;
    return null;
  }

  return null;
}

/**
 * Return a tracking-free URL for the same posting when we can confidently
 * reconstruct one — otherwise return the input unchanged.
 *
 * Why: LinkedIn's email-digest links carry tracking parameters like
 *   ?trk=eml-email_job_alert_digest_01-primary_job_list-0-job_posting_1_jobid_<id>...
 * which trigger their stripped-down "promoted teaser" page render — no h1,
 * no top-card classes, no JSON-LD JobPosting. That breaks the extension's
 * JD capture and makes the page look "funny" to the user. Navigating to the
 * canonical /jobs/view/<id>/ URL gives the full top card and reliable
 * extraction. (Regression cases: Geron Corp 4396151962, Figma 4392467444,
 * both surfaced 2026-04-29.)
 *
 * Conservative on non-LinkedIn URLs: many ATS platforms encode legitimate
 * state in query params (Workday view tokens, Greenhouse application flow),
 * so we only canonicalize platforms where stripping is known to be safe.
 */
export function canonicalizeJobUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/linkedin\.com/i.test(url)) {
    const m = url.match(/linkedin\.com[^\s]*\/(?:comm\/)?jobs\/view\/(\d+)/i);
    if (m) return `https://www.linkedin.com/jobs/view/${m[1]}/`;
  }
  return url;
}
