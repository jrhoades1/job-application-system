/**
 * Detect ATS vendor from a careers URL and extract the vendor's company slug.
 *
 * Input: any URL the user pastes ("https://boards.greenhouse.io/stripe",
 * "jobs.lever.co/netflix", "jobs.ashbyhq.com/anthropic/...").
 *
 * Output: { vendor, identifier } or null if unrecognized. When null, the
 * caller should fall back to the generic_llm vendor (or reject).
 */

import type { AtsVendor } from "./types";

export interface VendorDetection {
  vendor: AtsVendor;
  identifier: string;
}

const PATTERNS: { vendor: AtsVendor; regex: RegExp }[] = [
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
  // {slug}.wd1.myworkdayjobs.com / wd5, wd3, etc.
  {
    vendor: "workday",
    regex: /(?:^|\/\/)([a-z0-9][a-z0-9-]*)\.wd\d\.myworkdayjobs\.com/i,
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

  for (const { vendor, regex } of PATTERNS) {
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return { vendor, identifier: match[1].toLowerCase() };
    }
  }
  return null;
}
