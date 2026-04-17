/**
 * Career scan — shared types.
 *
 * Every vendor module returns a uniform JobListing[]. Downstream code
 * (diff, cron, pipeline_leads insert) only works against this shape.
 */

export type AtsVendor =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workday"
  | "icims"
  | "generic_llm";

export interface JobListing {
  /** Stable ID from the vendor. Used to diff runs. */
  externalId: string;
  title: string;
  /** Canonical URL to the live job posting — JD capture happens here. */
  url: string;
  location?: string;
  department?: string;
}

export interface VendorScanError extends Error {
  vendor: AtsVendor;
  identifier: string;
}

/**
 * Optional context passed to vendor scanners that need DB access (Workday
 * LLM fallback) or cost-cap checking. Greenhouse doesn't need it.
 *
 * `appliedFacets` is Workday-only. Shape matches Workday's CxS API exactly
 * (keys like jobFamilyGroup / locationMainGroup; values are arrays of
 * opaque facet IDs). Empty object = no filter. Ignored by other vendors.
 */
export interface ScanContext {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
  allowLlmFallback: boolean;
  appliedFacets?: Record<string, string[]>;
}
