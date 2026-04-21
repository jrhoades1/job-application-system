"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AppliedVelocityCard } from "@/components/dashboard/applied-velocity-card";

interface InsightsData {
  total: number;
  status_distribution: Record<string, number>;
  score_distribution: Record<string, number>;
  grade_distribution?: Record<"A" | "B" | "C" | "D" | "F", number>;
  archetype_distribution?: Record<string, number>;
  weekly_trend?: Array<{
    week_starting: string;
    total: number;
    strong: number;
    good: number;
    stretch: number;
    long_shot: number;
    unscored: number;
  }>;
  source_breakdown: Record<
    string,
    { total: number; interviews: number; offers: number }
  >;
  conversion_funnel: {
    bookmarked: number;
    applied: number;
    interviewing: number;
    offered: number;
    accepted: number;
  };
  rejection_patterns: { reason: string; count: number }[];
  score_tier_conversion?: Record<
    string,
    { total: number; interviews: number; rate: number }
  >;
  stalled_count: number;
  avg_days_to_rejection: number | null;
  data_maturity: string;
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!data || data.total === 0 || !data.conversion_funnel) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Insights</h2>
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">
              No application data yet. Start tracking applications to see
              insights here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const funnel = data.conversion_funnel;
  const funnelSteps = [
    { label: "Bookmarked", value: funnel.bookmarked },
    { label: "Applied", value: funnel.applied },
    { label: "Interviewing", value: funnel.interviewing },
    { label: "Offered", value: funnel.offered },
    { label: "Accepted", value: funnel.accepted },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Insights</h2>
        <Badge variant="outline">
          {data.data_maturity === "insufficient"
            ? "Need more data"
            : data.data_maturity === "early_signal"
              ? "Early signals"
              : "Trend data"}
        </Badge>
      </div>

      {/* Application velocity */}
      <AppliedVelocityCard />

      {/* Conversion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnelSteps.map((step, i) => {
              const pct =
                funnelSteps[0].value > 0
                  ? Math.round(
                      (step.value / funnelSteps[0].value) * 100
                    )
                  : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{step.label}</span>
                    <span className="text-muted-foreground">
                      {step.value} ({pct}%)
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(data.score_distribution).map(([tier, count]) => (
                <div key={tier} className="flex justify-between items-center">
                  <span className="text-sm capitalize">
                    {tier.replace("_", " ")}
                  </span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 bg-primary rounded"
                      style={{
                        width: `${Math.max(
                          8,
                          (count / data.total) * 120
                        )}px`,
                      }}
                    />
                    <span className="text-sm text-muted-foreground w-8 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Letter Grade Distribution (A/B/C/D/F) */}
        {data.grade_distribution && (
          <Card>
            <CardHeader>
              <CardTitle>Grade Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(["A", "B", "C", "D", "F"] as const).map((g) => {
                  const count = data.grade_distribution?.[g] ?? 0;
                  return (
                    <div key={g} className="flex justify-between items-center">
                      <span className="text-sm font-mono w-6">{g}</span>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 bg-primary rounded"
                          style={{
                            width: `${Math.max(8, (count / data.total) * 120)}px`,
                          }}
                        />
                        <span className="text-sm text-muted-foreground w-8 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Archetype Distribution */}
        {data.archetype_distribution && Object.keys(data.archetype_distribution).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>By Archetype</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(data.archetype_distribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([archetype, count]) => (
                    <div key={archetype} className="flex justify-between items-center">
                      <span className="text-sm">{archetype}</span>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 bg-primary rounded"
                          style={{
                            width: `${Math.max(8, (count / data.total) * 120)}px`,
                          }}
                        />
                        <span className="text-sm text-muted-foreground w-8 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weekly Trend (last 12 weeks) */}
        {data.weekly_trend && data.weekly_trend.some((w) => w.total > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Weekly Trend (last 12 weeks)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {data.weekly_trend.map((w) => (
                  <div key={w.week_starting} className="flex items-center gap-2 text-xs">
                    <span className="font-mono w-20 text-muted-foreground">
                      {w.week_starting}
                    </span>
                    <div className="flex-1 flex gap-px h-2">
                      {w.strong > 0 && (
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${w.strong * 8}px` }}
                          title={`${w.strong} strong`}
                        />
                      )}
                      {w.good > 0 && (
                        <div
                          className="bg-blue-500"
                          style={{ width: `${w.good * 8}px` }}
                          title={`${w.good} good`}
                        />
                      )}
                      {w.stretch > 0 && (
                        <div
                          className="bg-amber-500"
                          style={{ width: `${w.stretch * 8}px` }}
                          title={`${w.stretch} stretch`}
                        />
                      )}
                      {w.long_shot > 0 && (
                        <div
                          className="bg-rose-500"
                          style={{ width: `${w.long_shot * 8}px` }}
                          title={`${w.long_shot} long shot`}
                        />
                      )}
                      {w.unscored > 0 && (
                        <div
                          className="bg-muted-foreground/40"
                          style={{ width: `${w.unscored * 8}px` }}
                          title={`${w.unscored} unscored`}
                        />
                      )}
                    </div>
                    <span className="w-8 text-right text-muted-foreground">
                      {w.total || ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Score Tier Conversion */}
        {data.score_tier_conversion && (
          <Card>
            <CardHeader>
              <CardTitle>Interview Rate by Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(data.score_tier_conversion).map(
                  ([tier, stats]) => (
                    <div
                      key={tier}
                      className="flex justify-between items-center"
                    >
                      <span className="text-sm capitalize">
                        {tier.replace("_", " ")}
                      </span>
                      <span className="text-sm">
                        {stats.rate}% ({stats.interviews}/{stats.total})
                      </span>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Source Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>By Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(data.source_breakdown)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([source, stats]) => (
                  <div
                    key={source}
                    className="flex justify-between items-center text-sm"
                  >
                    <span>{source}</span>
                    <span className="text-muted-foreground">
                      {stats.total} apps, {stats.interviews} interviews
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Rejection Patterns */}
        <Card>
          <CardHeader>
            <CardTitle>Rejection Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            {data.rejection_patterns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No rejections tracked yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.rejection_patterns.map((p, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="truncate mr-2">{p.reason}</span>
                    <Badge variant="secondary">{p.count}</Badge>
                  </div>
                ))}
                {data.avg_days_to_rejection != null && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Average time to rejection:{" "}
                    {data.avg_days_to_rejection} days
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {data.stalled_count > 0 && (
        <Card className="border-yellow-300">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-yellow-700">
              {data.stalled_count} application
              {data.stalled_count > 1 ? "s" : ""} stalled for 21+ days
              without a status update. Consider following up.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
