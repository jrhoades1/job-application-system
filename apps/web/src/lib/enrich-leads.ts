/**
 * Lead-enrichment helper.
 *
 * For a given user, finds pending_review leads with a career_page_url and a
 * stub score (score_source !== "scored"), scrapes the real JD, re-scores
 * against the user's achievements, and updates the lead. Applies the Stage 2
 * floor: leads that fall below the user's threshold after enrichment are
 * auto-skipped.
 *
 * Used both by the standalone enrich-leads cron (safety net) and inline from
 * the nightly-pipeline cron (so the morning digest reflects scored matches
 * rather than estimated stubs capped at "stretch").
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { scrapeJobDescriptionDetailed } from "./scrape-job-url";
import {
  extractRequirements,
  scoreRequirement,
  scoreRequirementsWithAI,
  calculateOverallScore,
} from "@/scoring";
import { extractRequirementsWithAI } from "./extract-requirements-ai";
import { evaluateStage2, type LeadFilterPrefs } from "./lead-filter";

export interface EnrichStats {
  candidates: number;
  enriched: number;
  filtered: number;
  failed: number;
  dead: number;
}

export const MAX_LEADS_PER_USER = 20;

export async function enrichLeadsForUser(
  supabase: SupabaseClient,
  userId: string,
  maxLeads: number = MAX_LEADS_PER_USER
): Promise<EnrichStats> {
  const stats: EnrichStats = {
    candidates: 0,
    enriched: 0,
    filtered: 0,
    failed: 0,
    dead: 0,
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("achievements, preferences")
    .eq("clerk_user_id", userId)
    .single();

  if (!profile) return stats;

  const filterPrefs: LeadFilterPrefs = {
    lead_filter_enabled: profile.preferences?.lead_filter_enabled ?? true,
    lead_filter_min_score: profile.preferences?.lead_filter_min_score ?? 40,
    min_role_level: profile.preferences?.min_role_level,
    salary_min: profile.preferences?.salary_min ?? null,
    remote_preference: profile.preferences?.remote_preference,
  };

  const achievementsMap: Record<string, string[]> = {};
  const achievements = profile.achievements ?? [];
  if (Array.isArray(achievements)) {
    for (const cat of achievements) {
      if (cat.category && Array.isArray(cat.items)) {
        achievementsMap[cat.category] = cat.items.map(
          (i: { text: string }) => i.text
        );
      }
    }
  }

  const { data: candidates } = await supabase
    .from("pipeline_leads")
    .select("id, company, role, career_page_url, score_details")
    .eq("clerk_user_id", userId)
    .eq("status", "pending_review")
    .not("career_page_url", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(maxLeads);

  const stubs = (candidates ?? []).filter((c) => {
    const details = c.score_details as { score_source?: string } | null;
    return details?.score_source !== "scored";
  });

  stats.candidates = stubs.length;

  for (const lead of stubs) {
    try {
      const scraped = await scrapeJobDescriptionDetailed(lead.career_page_url!);

      if (scraped.kind === "dead") {
        await supabase
          .from("pipeline_leads")
          .update({
            status: "auto_skipped",
            skip_reason: scraped.reason,
            description_text: null,
          })
          .eq("id", lead.id)
          .eq("clerk_user_id", userId);
        stats.dead++;
        continue;
      }

      if (scraped.kind !== "ok" || scraped.description.length < 200) {
        stats.failed++;
        continue;
      }

      const reqs = extractRequirements(scraped.description);
      let allReqs = [...reqs.hard_requirements, ...reqs.preferred];
      const redFlags = reqs.red_flags;

      if (allReqs.length === 0) {
        try {
          const aiReqs = await extractRequirementsWithAI(
            scraped.description,
            lead.role,
            lead.company
          );
          allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
        } catch {
          // fall through with empty reqs; calculateOverallScore handles it
        }
      }

      let matches = await scoreRequirementsWithAI(allReqs, achievementsMap, {
        role: lead.role,
        company: lead.company,
      }).catch(() => []);

      if (matches.length === 0) {
        matches = allReqs.map((r) => scoreRequirement(r, achievementsMap));
      }

      const score = calculateOverallScore(matches, "scored");

      const stage2 = evaluateStage2(
        score.match_percentage,
        "scored",
        filterPrefs
      );

      const newStatus = stage2.pass ? "pending_review" : "auto_skipped";
      if (!stage2.pass) stats.filtered++;
      else stats.enriched++;

      await supabase
        .from("pipeline_leads")
        .update({
          description_text: scraped.description,
          status: newStatus,
          skip_reason: stage2.pass ? null : stage2.reason,
          score_overall: score.overall,
          score_match_percentage: score.match_percentage,
          score_details: {
            strong_count: score.strong_count,
            partial_count: score.partial_count,
            gap_count: score.gap_count,
            score_source: "scored",
          },
          red_flags: redFlags,
        })
        .eq("id", lead.id)
        .eq("clerk_user_id", userId);
    } catch (err) {
      console.error(`[enrich-leads] lead ${lead.id} failed:`, err);
      stats.failed++;
    }
  }

  return stats;
}
