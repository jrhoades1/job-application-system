/**
 * Weekly Intelligence Analyzer
 *
 * Analyzes application history to surface actionable insights:
 * - Source effectiveness (which channels convert?)
 * - Role-level fit (Director vs VP vs Manager conversion)
 * - Ghosting patterns (which round do apps die at?)
 * - Score-to-outcome correlation (do high scores actually help?)
 * - Pipeline health (velocity, stall rate, response times)
 *
 * Runs weekly (Mondays) as part of the nightly pipeline.
 * Stores findings in insight_notifications table.
 */

import { SupabaseClient } from "@supabase/supabase-js";

interface Insight {
  title: string;
  message: string;
  category: string;
  priority: "low" | "normal" | "high";
  data: Record<string, unknown> | null;
}

export interface IntelligenceResult {
  insights: Insight[];
  stats: {
    totalApps: number;
    dataMaturity: string;
  };
}

interface AppRow {
  id: string;
  status: string;
  source: string | null;
  role: string;
  company: string;
  applied_date: string | null;
  rejection_date: string | null;
  interview_round: number | null;
  created_at: string;
  match_scores: { overall: string | null; match_percentage: number | null }[] | { overall: string | null; match_percentage: number | null } | null;
}

interface HistoryRow {
  application_id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  source: string;
}

const INTERVIEW_STATUSES = ["interviewing", "offered", "accepted"];
const OFFER_STATUSES = ["offered", "accepted"];
const TERMINAL_STATUSES = ["rejected", "withdrawn", "accepted"];

function classifyRoleLevel(role: string): string {
  const r = role.toLowerCase();
  if (/\b(chief|cto|cio|ceo|c-level)\b/.test(r)) return "C-Level";
  if (/\b(vp|vice president|svp|evp)\b/.test(r)) return "VP";
  if (/\b(director|head of)\b/.test(r)) return "Director";
  if (/\b(senior manager|sr\.?\s*manager)\b/.test(r)) return "Senior Manager";
  if (/\b(manager|lead)\b/.test(r)) return "Manager";
  return "Other";
}

function getScore(app: AppRow): { overall: string | null; match_percentage: number | null } | null {
  if (!app.match_scores) return null;
  if (Array.isArray(app.match_scores)) return app.match_scores[0] ?? null;
  return app.match_scores;
}

export async function runWeeklyIntelligence(
  supabase: SupabaseClient,
  userId: string
): Promise<IntelligenceResult> {
  const insights: Insight[] = [];

  // Fetch all applications with scores
  const { data: apps } = await supabase
    .from("applications")
    .select("id, status, source, role, company, applied_date, rejection_date, interview_round, created_at, match_scores(overall, match_percentage)")
    .eq("clerk_user_id", userId)
    .is("deleted_at", null);

  if (!apps || apps.length < 10) {
    return {
      insights: [],
      stats: { totalApps: apps?.length ?? 0, dataMaturity: "insufficient" },
    };
  }

  const typedApps = apps as AppRow[];

  // Fetch status history for timing analysis
  const { data: history } = await supabase
    .from("application_status_history")
    .select("application_id, from_status, to_status, changed_at, source")
    .eq("clerk_user_id", userId)
    .order("changed_at", { ascending: true });

  const historyRows = (history ?? []) as HistoryRow[];

  // ============================================
  // 1. SOURCE EFFECTIVENESS
  // ============================================
  const sourceStats: Record<string, { total: number; interviews: number; offers: number }> = {};
  for (const app of typedApps) {
    const src = app.source ?? "Unknown";
    if (!sourceStats[src]) sourceStats[src] = { total: 0, interviews: 0, offers: 0 };
    sourceStats[src].total++;
    if (INTERVIEW_STATUSES.includes(app.status)) sourceStats[src].interviews++;
    if (OFFER_STATUSES.includes(app.status)) sourceStats[src].offers++;
  }

  // Find best and worst sources (min 5 apps to be meaningful)
  const significantSources = Object.entries(sourceStats).filter(([, s]) => s.total >= 5);
  if (significantSources.length >= 2) {
    const ranked = significantSources
      .map(([name, s]) => ({
        name,
        ...s,
        interviewRate: Math.round((s.interviews / s.total) * 100),
      }))
      .sort((a, b) => b.interviewRate - a.interviewRate);

    const best = ranked[0];
    const worst = ranked[ranked.length - 1];

    if (best.interviewRate > worst.interviewRate + 5) {
      insights.push({
        title: `${best.name} converts ${best.interviewRate}% to interviews`,
        message: `${best.name} gets you ${best.interviewRate}% interview rate (${best.interviews}/${best.total}), vs ${worst.name} at ${worst.interviewRate}% (${worst.interviews}/${worst.total}). Consider spending more time on ${best.name}.`,
        category: "source_analysis",
        priority: best.interviewRate >= 10 ? "high" : "normal",
        data: { sources: ranked },
      });
    }

    // Flag zero-conversion sources with high volume
    for (const src of ranked) {
      if (src.interviews === 0 && src.total >= 10) {
        insights.push({
          title: `${src.name}: ${src.total} apps, 0 interviews`,
          message: `You've sent ${src.total} applications via ${src.name} with zero interviews. This channel may not be worth the effort.`,
          category: "source_analysis",
          priority: "high",
          data: { source: src.name, total: src.total },
        });
      }
    }
  }

  // ============================================
  // 2. ROLE-LEVEL FIT
  // ============================================
  const roleLevelStats: Record<string, { total: number; interviews: number }> = {};
  for (const app of typedApps) {
    const level = classifyRoleLevel(app.role);
    if (!roleLevelStats[level]) roleLevelStats[level] = { total: 0, interviews: 0 };
    roleLevelStats[level].total++;
    if (INTERVIEW_STATUSES.includes(app.status)) roleLevelStats[level].interviews++;
  }

  const significantLevels = Object.entries(roleLevelStats).filter(([, s]) => s.total >= 5);
  if (significantLevels.length >= 2) {
    const ranked = significantLevels
      .map(([level, s]) => ({
        level,
        ...s,
        rate: Math.round((s.interviews / s.total) * 100),
      }))
      .sort((a, b) => b.rate - a.rate);

    const best = ranked[0];
    const worst = ranked[ranked.length - 1];

    if (best.rate > 0 && worst.rate === 0 && worst.total >= 5) {
      insights.push({
        title: `${best.level} roles convert, ${worst.level} roles don't`,
        message: `${best.level} roles: ${best.rate}% interview rate (${best.interviews}/${best.total}). ${worst.level} roles: 0% across ${worst.total} applications. Consider focusing on ${best.level}-level positions.`,
        category: "role_fit",
        priority: "high",
        data: { levels: ranked },
      });
    } else if (best.rate > worst.rate + 5) {
      insights.push({
        title: `Best fit: ${best.level} roles (${best.rate}% conversion)`,
        message: `${best.level} roles convert at ${best.rate}% vs ${worst.level} at ${worst.rate}%. Data suggests ${best.level} is your sweet spot.`,
        category: "role_fit",
        priority: "normal",
        data: { levels: ranked },
      });
    }
  }

  // ============================================
  // 3. GHOSTING PATTERNS
  // ============================================
  // Find apps that reached interviewing then went to rejected/withdrawn
  const ghostedApps = typedApps.filter(
    (a) => TERMINAL_STATUSES.includes(a.status) && a.status !== "accepted"
  );

  // Use status history to find which apps went through interviewing
  const interviewedThenDied: { app: AppRow; maxRound: number }[] = [];
  for (const app of ghostedApps) {
    const appHistory = historyRows.filter((h) => h.application_id === app.id);
    const wasInterviewing = appHistory.some((h) => h.to_status === "interviewing");
    if (wasInterviewing) {
      interviewedThenDied.push({ app, maxRound: app.interview_round ?? 1 });
    }
  }

  if (interviewedThenDied.length >= 3) {
    const byRound: Record<number, number> = {};
    for (const { maxRound } of interviewedThenDied) {
      byRound[maxRound] = (byRound[maxRound] ?? 0) + 1;
    }

    const deadliestRound = Object.entries(byRound).sort(
      ([, a], [, b]) => b - a
    )[0];

    if (deadliestRound) {
      const [round, count] = deadliestRound;
      insights.push({
        title: `${count} interviews died at round ${round}`,
        message: `Of ${interviewedThenDied.length} interviews that didn't result in an offer, ${count} ended at round ${round}. Consider asking about timeline and decision process before leaving round ${round} interviews.`,
        category: "ghosting_pattern",
        priority: count >= 3 ? "high" : "normal",
        data: { byRound, total: interviewedThenDied.length },
      });
    }
  }

  // ============================================
  // 4. SCORE-TO-OUTCOME CORRELATION
  // ============================================
  const scoreTiers: Record<string, { total: number; interviews: number }> = {};
  for (const app of typedApps) {
    const score = getScore(app);
    const tier = score?.overall ?? "unscored";
    if (!scoreTiers[tier]) scoreTiers[tier] = { total: 0, interviews: 0 };
    scoreTiers[tier].total++;
    if (INTERVIEW_STATUSES.includes(app.status)) scoreTiers[tier].interviews++;
  }

  const tierOrder = ["strong", "good", "stretch", "long_shot", "unscored"];
  const significantTiers = tierOrder
    .filter((t) => scoreTiers[t] && scoreTiers[t].total >= 3)
    .map((t) => ({
      tier: t,
      ...scoreTiers[t],
      rate: Math.round((scoreTiers[t].interviews / scoreTiers[t].total) * 100),
    }));

  if (significantTiers.length >= 2) {
    const strongRate = significantTiers.find((t) => t.tier === "strong" || t.tier === "good");
    const weakRate = significantTiers.find((t) => t.tier === "long_shot" || t.tier === "stretch");

    if (strongRate && weakRate) {
      if (strongRate.rate > weakRate.rate + 5) {
        insights.push({
          title: `High-match apps convert ${strongRate.rate}% vs ${weakRate.rate}%`,
          message: `"${strongRate.tier}" scored apps convert at ${strongRate.rate}% (${strongRate.interviews}/${strongRate.total}), while "${weakRate.tier}" converts at ${weakRate.rate}% (${weakRate.interviews}/${weakRate.total}). The scoring system is working -- prioritize higher-scored opportunities.`,
          category: "score_correlation",
          priority: "normal",
          data: { tiers: significantTiers },
        });
      } else if (weakRate.rate >= strongRate.rate) {
        insights.push({
          title: "Match scores aren't predicting outcomes",
          message: `Lower-scored apps (${weakRate.tier}: ${weakRate.rate}%) are converting as well as higher-scored ones (${strongRate.tier}: ${strongRate.rate}%). The scoring criteria may need recalibration.`,
          category: "score_correlation",
          priority: "high",
          data: { tiers: significantTiers },
        });
      }
    }
  }

  // ============================================
  // 5. PIPELINE HEALTH
  // ============================================
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentApps = typedApps.filter(
    (a) => a.applied_date && new Date(a.applied_date) >= thirtyDaysAgo
  );
  const previousApps = typedApps.filter(
    (a) =>
      a.applied_date &&
      new Date(a.applied_date) < thirtyDaysAgo &&
      new Date(a.applied_date) >= new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000)
  );

  if (recentApps.length > 0 && previousApps.length > 0) {
    const recentRate = Math.round(
      (recentApps.filter((a) => INTERVIEW_STATUSES.includes(a.status)).length /
        recentApps.length) *
        100
    );
    const previousRate = Math.round(
      (previousApps.filter((a) => INTERVIEW_STATUSES.includes(a.status)).length /
        previousApps.length) *
        100
    );

    if (recentRate > previousRate + 5) {
      insights.push({
        title: `Interview rate up: ${previousRate}% to ${recentRate}%`,
        message: `Last 30 days: ${recentRate}% interview rate (${recentApps.length} apps). Previous 30 days: ${previousRate}% (${previousApps.length} apps). Whatever you changed is working.`,
        category: "pipeline_health",
        priority: "normal",
        data: { recentRate, previousRate, recentCount: recentApps.length, previousCount: previousApps.length },
      });
    } else if (previousRate > recentRate + 5) {
      insights.push({
        title: `Interview rate dropped: ${previousRate}% to ${recentRate}%`,
        message: `Last 30 days: ${recentRate}% interview rate (${recentApps.length} apps). Previous 30 days: ${previousRate}% (${previousApps.length} apps). Review what changed -- targeting, resume, or application volume?`,
        category: "pipeline_health",
        priority: "high",
        data: { recentRate, previousRate, recentCount: recentApps.length, previousCount: previousApps.length },
      });
    }
  }

  // Weekly summary
  const weekApps = typedApps.filter(
    (a) => a.applied_date && new Date(a.applied_date) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  );
  const activeInterviews = typedApps.filter((a) => a.status === "interviewing").length;

  insights.push({
    title: `Weekly pulse: ${weekApps.length} applied, ${activeInterviews} interviewing`,
    message: `This week: ${weekApps.length} new applications. Active pipeline: ${activeInterviews} interviewing, ${typedApps.filter((a) => a.status === "applied").length} waiting for response. Total tracked: ${typedApps.length}.`,
    category: "weekly_summary",
    priority: "low",
    data: {
      weekApps: weekApps.length,
      activeInterviews,
      totalApplied: typedApps.filter((a) => a.status === "applied").length,
      total: typedApps.length,
    },
  });

  return {
    insights,
    stats: {
      totalApps: typedApps.length,
      dataMaturity: typedApps.length < 20 ? "early_signal" : "trend",
    },
  };
}

/**
 * Store insights in the database, deduplicating against recent entries.
 */
export async function storeInsights(
  supabase: SupabaseClient,
  userId: string,
  insights: Insight[]
): Promise<number> {
  if (insights.length === 0) return 0;

  // Check for recent duplicates (same title within 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("insight_notifications")
    .select("title")
    .eq("clerk_user_id", userId)
    .gte("created_at", sevenDaysAgo);

  const recentTitles = new Set((recent ?? []).map((r: { title: string }) => r.title));
  const newInsights = insights.filter((i) => !recentTitles.has(i.title));

  if (newInsights.length === 0) return 0;

  const { error } = await supabase.from("insight_notifications").insert(
    newInsights.map((i) => ({
      clerk_user_id: userId,
      title: i.title,
      message: i.message,
      category: i.category,
      priority: i.priority,
      data: i.data,
    }))
  );

  if (error) {
    console.error("[weekly-intelligence] Failed to store insights:", error);
    return 0;
  }

  return newInsights.length;
}
