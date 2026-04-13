/**
 * POST /api/admin/reprocess-leads
 *
 * Retroactively applies Stage 1 + Stage 2 filtering to every lead currently
 * sitting in pending_review for the authenticated user.
 *
 * Stage 1 runs against all leads (free, deterministic).
 * Stage 2 enrichment runs against survivors with a career_page_url, capped
 * at MAX_ENRICH_PER_RUN to bound AI cost and function duration.
 *
 * Returns a summary of what happened.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { scrapeJobDescriptionDetailed } from "@/lib/scrape-job-url";
import {
  extractRequirements,
  scoreRequirement,
  scoreRequirementsWithAI,
  calculateOverallScore,
} from "@/scoring";
import { extractRequirementsWithAI } from "@/lib/extract-requirements-ai";
import {
  evaluateStage1,
  evaluateStage2,
  type LeadFilterPrefs,
} from "@/lib/lead-filter";

export const maxDuration = 300;

const MAX_ENRICH_PER_RUN = 30;

interface ReprocessSummary {
  considered: number;
  stage1_filtered: number;
  stage2_enriched: number;
  stage2_filtered: number;
  enrichment_failed: number;
  bad_descriptions_scrubbed: number;
  dead_jobs_removed: number;
  remaining: number;
  hit_enrichment_cap: boolean;
}

/**
 * Detect description_text that's clearly not a real JD — forwarded email
 * headers, alert boilerplate, or too short to be scored. Legacy leads from
 * before the email-header stripping fix have these stored.
 */
function isBadDescription(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 200) return true;
  // Forwarded-header residue — From:/Sent:/Subject:/To: on separate lines
  const headerLines = (t.match(/(?:^|\n)(?:From|Sent|To|Subject|Date|Cc):\s/gi) ?? []).length;
  if (headerLines >= 3) return true;
  // JD signal check — real JDs have responsibilities/requirements/etc.
  const jdSignals = [
    /responsibilit/i, /requirement/i, /qualificat/i, /experience/i,
    /duties/i, /what you['']ll (?:do|bring)/i, /we['']re looking for/i,
    /must have/i, /years? of/i, /bachelor|master|degree/i,
  ];
  const signalCount = jdSignals.filter((p) => p.test(t)).length;
  return signalCount < 2;
}

export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("achievements, preferences")
      .eq("clerk_user_id", userId)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const filterPrefs: LeadFilterPrefs = {
      lead_filter_enabled: profile.preferences?.lead_filter_enabled ?? true,
      lead_filter_min_score: profile.preferences?.lead_filter_min_score ?? 40,
      min_role_level: profile.preferences?.min_role_level,
      salary_min: profile.preferences?.salary_min ?? null,
      remote_preference: profile.preferences?.remote_preference,
    };

    if (!filterPrefs.lead_filter_enabled) {
      return NextResponse.json(
        { error: "Pipeline filtering is disabled. Enable it in Bullseye settings first." },
        { status: 400 }
      );
    }

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

    // Pull every pending_review lead for this user
    const { data: leads } = await supabase
      .from("pipeline_leads")
      .select(
        "id, company, role, location, compensation, description_text, career_page_url, score_details"
      )
      .eq("clerk_user_id", userId)
      .eq("status", "pending_review")
      .is("deleted_at", null);

    const summary: ReprocessSummary = {
      considered: leads?.length ?? 0,
      stage1_filtered: 0,
      stage2_enriched: 0,
      stage2_filtered: 0,
      enrichment_failed: 0,
      bad_descriptions_scrubbed: 0,
      dead_jobs_removed: 0,
      remaining: 0,
      hit_enrichment_cap: false,
    };

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, summary });
    }

    // Stage 1 pass — deterministic, cheap
    const stage1Survivors: typeof leads = [];
    for (const lead of leads) {
      const stage1 = evaluateStage1(
        {
          role: lead.role,
          company: lead.company,
          location: lead.location,
          compensation: lead.compensation,
          description_text: lead.description_text,
        },
        filterPrefs
      );

      if (!stage1.pass) {
        await supabase
          .from("pipeline_leads")
          .update({ status: "auto_skipped", skip_reason: stage1.reason })
          .eq("id", lead.id)
          .eq("clerk_user_id", userId);
        summary.stage1_filtered++;
      } else {
        stage1Survivors.push(lead);
      }
    }

    // Stage 2 pass — enrich stub-scored OR bad-description leads with a URL
    const enrichCandidates = stage1Survivors.filter((l) => {
      if (!l.career_page_url) return false;
      const details = l.score_details as { score_source?: string } | null;
      if (details?.score_source !== "scored") return true; // stub — enrich
      if (isBadDescription(l.description_text)) return true; // garbage JD — re-enrich
      return false;
    });

    const toEnrich = enrichCandidates.slice(0, MAX_ENRICH_PER_RUN);
    if (enrichCandidates.length > MAX_ENRICH_PER_RUN) {
      summary.hit_enrichment_cap = true;
    }

    // Also scrub bad descriptions from leads without a URL — we can't re-score
    // but at least we clear the garbage so the UI doesn't show "From: LinkedIn"
    // as the job description.
    const scrubOnly = stage1Survivors.filter((l) => {
      if (l.career_page_url) return false; // handled in enrichment loop
      return isBadDescription(l.description_text);
    });
    for (const lead of scrubOnly) {
      await supabase
        .from("pipeline_leads")
        .update({ description_text: null })
        .eq("id", lead.id)
        .eq("clerk_user_id", userId);
      summary.bad_descriptions_scrubbed++;
    }

    for (const lead of toEnrich) {
      try {
        const scraped = await scrapeJobDescriptionDetailed(lead.career_page_url!);

        if (scraped.kind === "dead") {
          // Posting confirmed removed — auto-skip
          await supabase
            .from("pipeline_leads")
            .update({
              status: "auto_skipped",
              skip_reason: scraped.reason,
              description_text: null,
            })
            .eq("id", lead.id)
            .eq("clerk_user_id", userId);
          summary.dead_jobs_removed++;
          continue;
        }

        if (scraped.kind !== "ok" || scraped.description.length < 200) {
          // If the existing description_text is also garbage, null it out so
          // the UI stops showing forwarded-email headers as the JD.
          if (isBadDescription(lead.description_text)) {
            await supabase
              .from("pipeline_leads")
              .update({ description_text: null })
              .eq("id", lead.id)
              .eq("clerk_user_id", userId);
            summary.bad_descriptions_scrubbed++;
          }
          summary.enrichment_failed++;
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
            // fall through
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
        if (!stage2.pass) summary.stage2_filtered++;
        else summary.stage2_enriched++;

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
        console.error(`[reprocess-leads] lead ${lead.id} failed:`, err);
        summary.enrichment_failed++;
      }
    }

    summary.remaining =
      summary.considered -
      summary.stage1_filtered -
      summary.stage2_filtered -
      summary.dead_jobs_removed;

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[reprocess-leads] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
