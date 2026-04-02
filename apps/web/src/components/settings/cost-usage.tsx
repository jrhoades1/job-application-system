"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface SubscriptionData {
  plan_type: string;
  plan_label: string;
  applications_used: number;
  applications_cap: number;
  top_off_balance: number;
  total_available: number;
  billing_period_end: string | null;
  has_stripe: boolean;
}

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

interface UserUsageData {
  total_users: number;
  total_cost: number;
  by_user: { userId: string; calls: number; cost: number; types: Record<string, number> }[];
}

export function CostUsage() {
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [data, setData] = useState<UsageData | null>(null);
  const [userUsage, setUserUsage] = useState<UserUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/subscription").then((r) => r.json()),
      fetch("/api/admin/usage").then((r) => r.json()),
      fetch("/api/admin/users-usage").then((r) => r.ok ? r.json() : null),
    ])
      .then(([subData, usageData, userData]) => {
        setSub(subData);
        setData(usageData);
        if (userData) setUserUsage(userData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleCheckout(plan: string) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTopOff() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/top-off", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePortal() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  const planType = sub?.plan_type ?? "free";
  const used = sub?.applications_used ?? 0;
  const cap = sub?.applications_cap ?? 3;
  const topOff = sub?.top_off_balance ?? 0;
  const totalAvailable = cap + topOff;
  const pct = totalAvailable > 0 ? Math.round((used / totalAvailable) * 100) : 0;
  const isFree = planType === "free";

  return (
    <div className="space-y-6">
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

      {/* Plan & Application Meter */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your Plan
            </CardTitle>
            <Badge variant={isFree ? "secondary" : "default"}>
              {sub?.plan_label ?? "Free"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {used} of {totalAvailable} applications
          </div>
          {topOff > 0 && (
            <div className="text-sm text-muted-foreground mt-1">
              {cap} included + {topOff} bonus
            </div>
          )}
          <Progress
            value={Math.min(pct, 100)}
            className={`mt-3 ${pct >= 80 ? "[&>div]:bg-red-500" : pct >= 60 ? "[&>div]:bg-yellow-500" : ""}`}
          />
          {sub?.billing_period_end && (
            <div className="text-xs text-muted-foreground mt-2">
              Resets {new Date(sub.billing_period_end).toLocaleDateString()}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mt-4">
            {isFree && (
              <Button
                onClick={() => handleCheckout("pro")}
                disabled={actionLoading}
              >
                Upgrade to Pro - $25/mo
              </Button>
            )}
            {!isFree && pct >= 60 && (
              <Button
                variant="outline"
                onClick={handleTopOff}
                disabled={actionLoading}
              >
                Buy 10 More Applications - $5
              </Button>
            )}
            {sub?.has_stripe && (
              <Button
                variant="ghost"
                onClick={handlePortal}
                disabled={actionLoading}
              >
                Manage Billing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Cost Breakdown (secondary info) */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI Cost This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(data?.total_spend ?? 0).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {data?.total_calls ?? 0} AI calls
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Token Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(((data?.total_input_tokens ?? 0) + (data?.total_output_tokens ?? 0)) / 1000).toFixed(1)}K
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {((data?.total_input_tokens ?? 0) / 1000).toFixed(1)}K in / {((data?.total_output_tokens ?? 0) / 1000).toFixed(1)}K out
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
                    {stats.count} calls - ${stats.cost.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-user breakdown (admin only) */}
      {userUsage && (
        <Card>
          <CardHeader>
            <CardTitle>
              All Users This Month{" "}
              <span className="text-muted-foreground font-normal text-sm">
                {userUsage.total_users} users / ${userUsage.total_cost.toFixed(4)} total
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {userUsage.by_user.map((u) => (
                <div
                  key={u.userId}
                  className="flex justify-between items-center text-sm py-1 border-b last:border-0"
                >
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">{u.userId.slice(0, 20)}...</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {Object.entries(u.types).map(([t, n]) => `${t.replace(/_/g, " ")} x${n}`).join(", ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{u.calls} calls</span>
                    <Badge variant="outline">${u.cost.toFixed(4)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
