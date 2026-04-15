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
