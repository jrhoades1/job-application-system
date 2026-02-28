"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface InsightsData {
  total: number;
  status_distribution: Record<string, number>;
  score_distribution: Record<string, number>;
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
  if (!data || data.total === 0) {
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
