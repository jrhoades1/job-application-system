/**
 * Career scan -- vendor dispatcher.
 *
 * One entry point, scanCompany(), routes to the right vendor module based on
 * ats_vendor. Unknown/unimplemented vendors throw so the cron marks the run
 * failed and surfaces the error in last_error.
 */

import type { AtsVendor, JobListing, ScanContext } from "./types";
import { scanGreenhouse } from "./vendors/greenhouse";
import { scanWorkday } from "./vendors/workday";
import { scanRadancy } from "./vendors/radancy";
import { scanIcims } from "./vendors/icims";

export { detectVendor } from "./detect-vendor";
export type { VendorDetection } from "./detect-vendor";
export { diffSnapshots } from "./diff";
export type { DiffResult, PriorSnapshotRow } from "./diff";
export type { AtsVendor, JobListing, ScanContext } from "./types";
export { WorkdayAuthError, WorkdayRateLimitError } from "./vendors/workday";
export {
  RadancyAuthError,
  RadancyRateLimitError,
  detectRadancyAsync,
} from "./vendors/radancy";
export { IcimsAuthError } from "./vendors/icims";

export async function scanCompany(
  vendor: AtsVendor,
  identifier: string,
  context?: ScanContext
): Promise<JobListing[]> {
  switch (vendor) {
    case "greenhouse":
      return scanGreenhouse(identifier);
    case "workday":
      return scanWorkday(identifier, context);
    case "radancy":
      return scanRadancy(identifier);
    case "icims":
      return scanIcims(identifier, context);
    case "lever":
    case "ashby":
    case "smartrecruiters":
    case "generic_llm":
      throw new Error(`Vendor '${vendor}' not implemented yet`);
    default: {
      const _exhaustive: never = vendor;
      throw new Error(`Unknown vendor: ${_exhaustive}`);
    }
  }
}
