/**
 * Detect ATS vendor from a careers URL and extract the vendor's company slug.
 *
 * Input: any URL the user pastes ("https://boards.greenhouse.io/stripe",
 * "jobs.lever.co/netflix", "humana.wd5.myworkdayjobs.com/...").
 *
 * Output: { vendor, identifier } or null if unrecognized. When null, the
 * caller should fall back to the generic_llm vendor (or reject).
 *
 * Workday identifiers are 3-part: "{tenant}/{wdN}/{site}" because the wdN
 * number varies per tenant and is needed to reconstruct the API URL.
 */

import type { AtsVendor } from "./types";

export interface VendorDetection {
  vendor: AtsVendor;
  identifier: string;
}

interface PatternEntry {
  vendor: AtsVendor;
  regex: RegExp;
  buildIdentifier?: (match: RegExpMatchArray) => string | null;
}

const PATTERNS: PatternEntry[] = [
  // boards.greenhouse.io/{slug} or job-boards.greenhouse.io/{slug}
  {
    vendor: "greenhouse",
    regex: /(?:^|\/\/)(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/([a-z0-9][a-z0-9-]*)/i,
  },
  // jobs.lever.co/{slug}
  {
    vendor: "lever",
    regex: /(?:^|\/\/)jobs\.lever\.co\/([a-z0-9][a-z0-9-]*)/i,
  },
  // jobs.ashbyhq.com/{slug}
  {
    vendor: "ashby",
    regex: /(?:^|\/\/)jobs\.ashbyhq\.com\/([a-z0-9][a-z0-9-]*)/i,
  },
  // careers.smartrecruiters.com/{slug} or jobs.smartrecruiters.com/{slug}
  {
    vendor: "smartrecruiters",
    regex: /(?:^|\/\/)(?:careers|jobs)\.smartrecruiters\.com\/([a-z0-9][a-z0-9-]*)/i,
  },
  // Workday legacy/localized: {tenant}.wd{N}.myworkdayjobs.com/{locale?/}{site}
  {
    vendor: "workday",
    regex: /(?:^|\/\/)([a-z0-9][a-z0-9-]*)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?([A-Za-z0-9_-]+)/i,
    buildIdentifier: (m) => `${m[1].toLowerCase()}/${m[2].toLowerCase()}/${m[3]}`,
  },
  // Workday newer: wd{N}.myworkdaysite.com/recruiting/{tenant}/{site}
  {
    vendor: "workday",
    regex: /(?:^|\/\/)(wd\d+)\.myworkdaysite\.com\/recruiting\/([a-z0-9][a-z0-9-]*)\/([A-Za-z0-9_-]+)/i,
    buildIdentifier: (m) => `${m[2].toLowerCase()}/${m[1].toLowerCase()}/${m[3]}`,
  },
  // careers-{slug}.icims.com
  {
    vendor: "icims",
    regex: /(?:^|\/\/)careers-([a-z0-9][a-z0-9-]*)\.icims\.com/i,
  },
];

export function detectVendor(url: string): VendorDetection | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  for (const { vendor, regex, buildIdentifier } of PATTERNS) {
    const match = trimmed.match(regex);
    if (match) {
      const identifier = buildIdentifier
        ? buildIdentifier(match)
        : match[1]?.toLowerCase() ?? null;
      if (identifier) return { vendor, identifier };
    }
  }
  return null;
}
