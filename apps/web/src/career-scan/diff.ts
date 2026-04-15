/**
 * Snapshot diff — compare a fresh scan against the stored snapshot table.
 *
 * Returns three groups:
 *   - new: listings not in the prior snapshot (externalId unseen)
 *   - stillPresent: listings whose externalId matches an active prior row
 *   - removed: prior rows whose externalId is absent from the fresh scan
 *
 * "Active prior row" = removed_at IS NULL. The caller applies:
 *   - insert rows for `new`
 *   - update last_seen_at for `stillPresent`
 *   - set removed_at for `removed`
 */

import type { JobListing } from "./types";

export interface PriorSnapshotRow {
  id: string;
  job_external_id: string;
}

export interface DiffResult {
  new: JobListing[];
  stillPresent: { snapshotId: string; listing: JobListing }[];
  removedIds: string[];
}

export function diffSnapshots(
  fresh: JobListing[],
  prior: PriorSnapshotRow[]
): DiffResult {
  const priorByExtId = new Map(prior.map((p) => [p.job_external_id, p.id]));
  const freshByExtId = new Map(fresh.map((j) => [j.externalId, j]));

  const newListings: JobListing[] = [];
  const stillPresent: { snapshotId: string; listing: JobListing }[] = [];

  for (const listing of fresh) {
    const priorId = priorByExtId.get(listing.externalId);
    if (priorId) {
      stillPresent.push({ snapshotId: priorId, listing });
    } else {
      newListings.push(listing);
    }
  }

  const removedIds: string[] = [];
  for (const p of prior) {
    if (!freshByExtId.has(p.job_external_id)) {
      removedIds.push(p.id);
    }
  }

  return { new: newListings, stillPresent, removedIds };
}
