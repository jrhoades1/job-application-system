/**
 * Enrich Leads Cron — Stage 2 of the pipeline filter.
 *
 * For each user, find pending_review leads with:
 *   - a career_page_url
 *   - a stub score (score_source === "estimated")
 *
 * Fetch the real JD via scrapeJobDescription, re-score against the user's
 * achievements, then either:
 *   - Update the lead with the real JD + new score, OR
 *   - Auto-skip if the new real-JD score is below the user's floor.
 *
 * Runs at 02:30 UTC, 30 minutes after the nightly-pipeline sync, so fresh
 * leads from the same night get a chance to be enriched before the morning.
 */

import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { scrapeJobDescriptionDetailed } from "@/lib/scrape-job-url";
import {
  extractRequirements,
  scoreRequirement,
  scoreRequirementsWithAI,
  calculateOverallScore,
} from "@/scoring";
import { extractRequirementsWithAI } from "@/lib/extract-requirements-ai";
import { evaluateStage2, type LeadFilterPrefs } from "@/lib/lead-filter";

export const maxDuration = 300;

const MAX_LEADS_PER_USER = 20; // cap per run to stay within the function budget

interface EnrichStats {
  userId: string;
  candidates: number;
  enriched: number;
  filtered: number;
  failed: number;
  dead: number;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleClient();

  const { data: connections } = await supabase
    .from("email_connections")
    .select("clerk_user_id")
    .eq("is_active", true);

  const results: EnrichStats[] = [];

  for (const conn of connections ?? []) {
    const userId = conn.clerk_user_id;
    const stats: EnrichStats = {
      userId,
      candidates: 0,
      enriched: 0,
      filtered: 0,
      failed: 0,
      dead: 0,
    };

    try {
      // Load profile for scoring + filter prefs
      const { data: profile } = await supabase
        .from("profiles")
        .select("achievements, preferences")
        .eq("clerk_user_id", userId)
        .single();

      if (!profile) {
        results.push(stats);
        continue;
      }

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

      // Find candidates: pending_review, stub-scored, with a URL we can fetch
      const { data: candidates } = await supabase
        .from("pipeline_leads")
        .select("id, company, role, career_page_url, score_details")
        .eq("clerk_user_id", userId)
        .eq("status", "pending_review")
        .not("career_page_url", "is", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(MAX_LEADS_PER_USER);

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

          // Re-score with the real JD
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

          // Apply Stage 2 floor with the fresh real-JD score
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
    } catch (err) {
      console.error(`[enrich-leads] user ${userId} failed:`, err);
    }

    results.push(stats);
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
