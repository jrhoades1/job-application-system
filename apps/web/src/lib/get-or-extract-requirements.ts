import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractRequirements } from "@/scoring";
import { extractRequirementsWithAI } from "@/lib/extract-requirements-ai";

export interface CachedRequirements {
  requirements: string[];
  cached: boolean;
}

export function hashJd(jd: string): string {
  return createHash("sha256").update(jd).digest("hex");
}

/**
 * Return the requirement set for an application's JD, reusing the cached set
 * stored in match_scores when the JD hasn't changed.
 *
 * Without caching, every Tailor Resume click re-runs the regex (deterministic)
 * + occasional Haiku-AI fallback (non-deterministic) — and the AI fallback's
 * output count fluctuates between calls. That shifts the match_percentage
 * denominator and surfaces as inexplicable score drops after the user
 * addresses gaps, even with temperature=0 on the scorer.
 *
 * The first call extracts and persists; subsequent calls with the same JD
 * return the cached array. JD edits invalidate the cache via SHA-256 mismatch.
 */
export async function getOrExtractRequirements(
  supabase: SupabaseClient,
  applicationId: string,
  jobDescription: string,
  role: string,
  company: string
): Promise<CachedRequirements> {
  const currentHash = hashJd(jobDescription);

  const { data: existing } = await supabase
    .from("match_scores")
    .select("extracted_requirements, jd_hash")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (
    existing?.jd_hash === currentHash &&
    Array.isArray(existing.extracted_requirements) &&
    existing.extracted_requirements.length > 0
  ) {
    return {
      requirements: existing.extracted_requirements as string[],
      cached: true,
    };
  }

  const reqs = extractRequirements(jobDescription);
  let allReqs = [...reqs.hard_requirements, ...reqs.preferred];

  if (allReqs.length < 3 && jobDescription.length > 500) {
    const aiReqs = await extractRequirementsWithAI(
      jobDescription,
      role,
      company
    );
    const aiAll = [...aiReqs.hard_requirements, ...aiReqs.preferred];
    if (aiAll.length > allReqs.length) {
      allReqs = aiAll;
    }
  }

  if (allReqs.length > 0) {
    await supabase
      .from("match_scores")
      .update({
        extracted_requirements: allReqs,
        jd_hash: currentHash,
      })
      .eq("application_id", applicationId);
  }

  return { requirements: allReqs, cached: false };
}
