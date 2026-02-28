"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface UsageData {
  cap: number;
  total_spend: number;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  spend_by_type: Record<string, { count: number; cost: number }>;
  projected_monthly: number;
  percent_used: number;
  alerts: { id: string; alert_type: string; severity: string; message: string; created_at: string }[];
  recent_calls: {
    generation_type: string;
    model_used: string;
    tokens_input: number;
    tokens_output: number;
    cost_usd: number;
    created_at: string;
  }[];
}

export default function AdminPage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/usage")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  const cap = data?.cap ?? 10;
  const spend = data?.total_spend ?? 0;
  const pct = data?.percent_used ?? 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Cost Admin</h2>

      {/* Alert banner */}
      {data?.alerts && data.alerts.length > 0 && (
        <Card className="border-yellow-400 bg-yellow-50">
          <CardContent className="py-3">
            {data.alerts.map((alert) => (
              <p key={alert.id} className="text-sm text-yellow-800">
                {alert.message}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI Spend This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${spend.toFixed(2)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              of ${cap.toFixed(2)} budget ({pct}%)
            </div>
            <Progress
              value={Math.min(pct, 100)}
              className={`mt-3 ${pct >= 80 ? "[&>div]:bg-red-500" : ""}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI Calls This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.total_calls ?? 0}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Projected: ${(data?.projected_monthly ?? 0).toFixed(2)}/month
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {((data?.total_input_tokens ?? 0) / 1000).toFixed(1)}K input /{" "}
              {((data?.total_output_tokens ?? 0) / 1000).toFixed(1)}K output
              tokens
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spend by type */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.spend_by_type ||
          Object.keys(data.spend_by_type).length === 0 ? (
            <p className="text-muted-foreground">
              No AI usage yet. Usage will be tracked here once you start
              analyzing jobs, tailoring resumes, or generating cover letters.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(data.spend_by_type).map(([type, stats]) => (
                <div
                  key={type}
                  className="flex justify-between items-center text-sm"
                >
                  <span className="capitalize">
                    {type.replace(/_/g, " ")}
                  </span>
                  <span className="text-muted-foreground">
                    {stats.count} calls — ${stats.cost.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent calls */}
      {data?.recent_calls && data.recent_calls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent AI Calls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recent_calls.map((call, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center text-sm py-1 border-b last:border-0"
                >
                  <div>
                    <span className="capitalize">
                      {call.generation_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {call.model_used.split("-").slice(0, 2).join(" ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {call.tokens_input + call.tokens_output} tokens
                    </span>
                    <Badge variant="outline">${call.cost_usd.toFixed(4)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(call.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
