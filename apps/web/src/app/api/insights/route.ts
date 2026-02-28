import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Fetch all applications with scores
    const { data: apps } = await supabase
      .from("applications")
      .select("status, source, applied_date, rejection_date, rejection_reason, created_at, match_scores(overall, match_percentage)")
      .eq("clerk_user_id", userId);

    if (!apps || apps.length === 0) {
      return NextResponse.json({
        total: 0,
        status_distribution: {},
        score_distribution: {},
        source_breakdown: {},
        conversion_funnel: {},
        rejection_patterns: [],
        stalled_count: 0,
        avg_days_to_rejection: null,
        data_maturity: "insufficient",
      });
    }

    // Status distribution
    const statusDist: Record<string, number> = {};
    for (const app of apps) {
      statusDist[app.status] = (statusDist[app.status] ?? 0) + 1;
    }

    // Score distribution
    const scoreDist: Record<string, number> = {};
    for (const app of apps) {
      const score = Array.isArray(app.match_scores)
        ? app.match_scores[0]
        : app.match_scores;
      const tier = score?.overall ?? "unscored";
      scoreDist[tier] = (scoreDist[tier] ?? 0) + 1;
    }

    // Source breakdown with conversion rates
    const sourceBreakdown: Record<
      string,
      { total: number; interviews: number; offers: number }
    > = {};
    for (const app of apps) {
      const source = app.source ?? "Unknown";
      if (!sourceBreakdown[source]) {
        sourceBreakdown[source] = { total: 0, interviews: 0, offers: 0 };
      }
      sourceBreakdown[source].total++;
      if (
        ["interviewing", "offered", "accepted"].includes(app.status)
      ) {
        sourceBreakdown[source].interviews++;
      }
      if (["offered", "accepted"].includes(app.status)) {
        sourceBreakdown[source].offers++;
      }
    }

    // Conversion funnel
    const funnel = {
      bookmarked: apps.filter((a) => a.status !== "skipped").length,
      applied: apps.filter((a) =>
        ["applied", "interviewing", "offered", "accepted", "rejected"].includes(
          a.status
        )
      ).length,
      interviewing: apps.filter((a) =>
        ["interviewing", "offered", "accepted"].includes(a.status)
      ).length,
      offered: apps.filter((a) =>
        ["offered", "accepted"].includes(a.status)
      ).length,
      accepted: apps.filter((a) => a.status === "accepted").length,
    };

    // Rejection patterns
    const rejectionReasons: Record<string, number> = {};
    let totalDaysToRejection = 0;
    let rejectionCount = 0;
    for (const app of apps) {
      if (app.status === "rejected") {
        const reason = app.rejection_reason ?? "No reason given";
        rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;

        if (app.applied_date && app.rejection_date) {
          const days = Math.round(
            (new Date(app.rejection_date).getTime() -
              new Date(app.applied_date).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          if (days >= 0) {
            totalDaysToRejection += days;
            rejectionCount++;
          }
        }
      }
    }

    const rejectionPatterns = Object.entries(rejectionReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Stalled applications (applied 21+ days ago, no status change)
    const now = Date.now();
    const stalledCount = apps.filter((a) => {
      if (a.status !== "applied") return false;
      const appliedDate = a.applied_date
        ? new Date(a.applied_date).getTime()
        : new Date(a.created_at).getTime();
      return now - appliedDate > 21 * 24 * 60 * 60 * 1000;
    }).length;

    // Score tier conversion rates
    const scoreTierConversion: Record<
      string,
      { total: number; interviews: number; rate: number }
    > = {};
    for (const app of apps) {
      const score = Array.isArray(app.match_scores)
        ? app.match_scores[0]
        : app.match_scores;
      const tier = score?.overall ?? "unscored";
      if (!scoreTierConversion[tier]) {
        scoreTierConversion[tier] = { total: 0, interviews: 0, rate: 0 };
      }
      scoreTierConversion[tier].total++;
      if (
        ["interviewing", "offered", "accepted"].includes(app.status)
      ) {
        scoreTierConversion[tier].interviews++;
      }
    }
    for (const tier of Object.values(scoreTierConversion)) {
      tier.rate =
        tier.total > 0
          ? Math.round((tier.interviews / tier.total) * 100)
          : 0;
    }

    const dataMaturity =
      apps.length < 5
        ? "insufficient"
        : apps.length < 20
          ? "early_signal"
          : "trend";

    return NextResponse.json({
      total: apps.length,
      status_distribution: statusDist,
      score_distribution: scoreDist,
      source_breakdown: sourceBreakdown,
      conversion_funnel: funnel,
      rejection_patterns: rejectionPatterns,
      score_tier_conversion: scoreTierConversion,
      stalled_count: stalledCount,
      avg_days_to_rejection:
        rejectionCount > 0
          ? Math.round(totalDaysToRejection / rejectionCount)
          : null,
      data_maturity: dataMaturity,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
