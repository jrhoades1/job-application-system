/**
 * Career scan — vendor dispatcher.
 *
 * One entry point, scanCompany(), routes to the right vendor module based on
 * ats_vendor. Unknown/unimplemented vendors throw so the cron marks the run
 * failed and surfaces the error in last_error.
 */

import type { AtsVendor, JobListing } from "./types";
import { scanGreenhouse } from "./vendors/greenhouse";

export { detectVendor } from "./detect-vendor";
export type { VendorDetection } from "./detect-vendor";
export { diffSnapshots } from "./diff";
export type { DiffResult, PriorSnapshotRow } from "./diff";
export type { AtsVendor, JobListing } from "./types";

export async function scanCompany(
  vendor: AtsVendor,
  identifier: string
): Promise<JobListing[]> {
  switch (vendor) {
    case "greenhouse":
      return scanGreenhouse(identifier);
    case "lever":
    case "ashby":
    case "smartrecruiters":
    case "workday":
    case "icims":
    case "generic_llm":
      throw new Error(`Vendor '${vendor}' not implemented yet`);
    default: {
      const _exhaustive: never = vendor;
      throw new Error(`Unknown vendor: ${_exhaustive}`);
    }
  }
}
