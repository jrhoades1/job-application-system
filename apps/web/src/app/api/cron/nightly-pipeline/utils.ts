/**
 * Pure utility functions for the nightly pipeline.
 * Extracted here so they can be unit-tested without loading Next.js or Supabase.
 */

export type DigestSkipReason = "digest_off" | "weekly_not_monday";

/** Returns whether a digest email should be skipped for the given frequency + ISO weekday. */
export function shouldSkipDigest(
  frequency: string,
  dayOfWeek: number
): { skip: boolean; reason?: DigestSkipReason } {
  if (frequency === "off") return { skip: true, reason: "digest_off" };
  if (frequency === "weekly" && dayOfWeek !== 1)
    return { skip: true, reason: "weekly_not_monday" };
  return { skip: false };
}

/** Escape characters that have special meaning in HTML. Used when interpolating DB values into email templates. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
