"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGmailSync } from "@/hooks/use-gmail-sync";
import { AppliedVelocityCard } from "@/components/dashboard/applied-velocity-card";
import { GmailHealthBanner } from "@/components/dashboard/gmail-health-banner";

interface DigestLead {
  id: string;
  company: string;
  role: string;
  score_overall: string | null;
  score_match_percentage: number | null;
}

interface DigestRun {
  run_date: string;
  emails_fetched: number;
  leads_created: number;
  above_threshold: number;
  top_leads: DigestLead[];
}

interface TodayAction {
  id: string;
  type: string;
  priority: "urgent" | "today" | "week";
  company: string;
  role: string;
  action_label: string;
  action_url: string;
  detail: string;
  due_date: string | null;
}

interface TodayData {
  actions: TodayAction[];
  stats: {
    total: number;
    active: number;
    interviewing: number;
    offers: number;
  };
}

const PRIORITY_CONFIG = {
  urgent: {
    label: "Urgent",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-700",
  },
  today: {
    label: "Do Today",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700",
  },
  week: {
    label: "This Week",
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-700",
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-600",
  },
};

const ACTION_ICONS: Record<string, string> = {
  interview_soon: "🎤",
  overdue_followup: "⏰",
  debrief_needed: "📝",
  new_leads: "📬",
  followup_due_today: "📞",
  needs_first_followup: "👋",
  find_referral: "🤝",
  ready_to_apply: "📄",
  stalled: "⏳",
  followup_this_week: "📅",
  decay_warning: "⚠️",
  decay_imminent: "🚨",
  insight: "💡",
};

export default function DashboardPage() {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [digest, setDigest] = useState<DigestRun | null>(null);

  const refreshActions = useCallback(async () => {
    const res = await fetch("/api/today-actions");
    if (res.ok) setData(await res.json());
  }, []);

  const { syncing, connected: emailConnected, sync: handleSync } = useGmailSync({
    onSynced: refreshActions,
  });

  useEffect(() => {
    async function load() {
      try {
        const [actionsRes, digestRes] = await Promise.all([
          fetch("/api/today-actions"),
          fetch("/api/digest"),
        ]);
        if (actionsRes.ok) setData(await actionsRes.json());
        if (digestRes.ok) {
          const d = await digestRes.json();
          if (d) setDigest(d);
        }
      } catch {
        // silent fail
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="text-muted-foreground p-4">Loading...</p>;

  const actions = data?.actions ?? [];
  const stats = data?.stats ?? {
    total: 0,
    active: 0,
    interviewing: 0,
    offers: 0,
  };

  const urgent = actions.filter((a) => a.priority === "urgent");
  const today = actions.filter((a) => a.priority === "today");
  const week = actions.filter((a) => a.priority === "week");

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Today</h2>
          <p className="text-sm text-muted-foreground">{dateStr}</p>
        </div>
        {emailConnected && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Sync Email"}
          </Button>
        )}
      </div>

      {/* Gmail health warning — only renders when connection is unhealthy */}
      <GmailHealthBanner />

      {/* Morning digest banner */}
      {digest && digest.above_threshold > 0 && (
        <DigestBanner digest={digest} />
      )}

      {/* All caught up */}
      {actions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-2xl mb-2">You&apos;re all caught up</p>
            <p className="text-muted-foreground">
              No pending actions. Add jobs or sync your email to get started.
            </p>
            <div className="flex justify-center gap-3 mt-4">
              <Link href="/dashboard/jobs">
                <Button variant="outline" size="sm">
                  Add Application
                </Button>
              </Link>
              {emailConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  Sync Email
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action sections */}
      {urgent.length > 0 && (
        <ActionSection priority="urgent" actions={urgent} onRefresh={refreshActions} />
      )}
      {today.length > 0 && (
        <ActionSection priority="today" actions={today} onRefresh={refreshActions} />
      )}
      {week.length > 0 && <ActionSection priority="week" actions={week} onRefresh={refreshActions} />}

      {/* Insights section */}
      <InsightsSection onRefresh={refreshActions} />

      {/* Applied velocity */}
      <AppliedVelocityCard />

      {/* Compact stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, href: "/dashboard/jobs?tab=evaluating" },
          {
            label: "Active",
            value: stats.active,
            href: "/dashboard/jobs?tab=applied",
          },
          {
            label: "Interviewing",
            value: stats.interviewing,
            href: "/dashboard/jobs?tab=interviewing",
          },
          {
            label: "Offers",
            value: stats.offers,
            href: "/dashboard/jobs?tab=offers",
          },
        ].map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardContent className="py-3 text-center">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DigestBanner({ digest }: { digest: DigestRun }) {
  const runDate = new Date(digest.run_date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <Card className="border-green-200 bg-green-50">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-green-800">
              Morning Digest — {runDate}
            </p>
            <p className="text-sm text-green-700 mt-0.5">
              {digest.above_threshold} new match{digest.above_threshold !== 1 ? "es" : ""} above
              your threshold · {digest.emails_fetched} email{digest.emails_fetched !== 1 ? "s" : ""} scanned
            </p>
            {digest.top_leads.length > 0 && (
              <div className="mt-2 space-y-1">
                {digest.top_leads.map((lead, i) => (
                  <p key={lead.id} className="text-sm text-green-800">
                    {i + 1}.{" "}
                    <span className="font-medium">{lead.company}</span> —{" "}
                    {lead.role}
                    {lead.score_match_percentage != null && (
                      <span className="ml-1 text-green-600">
                        ({Math.round(lead.score_match_percentage)}% match)
                      </span>
                    )}
                  </p>
                ))}
              </div>
            )}
          </div>
          <Link href="/dashboard/jobs?tab=leads" className="shrink-0">
            <Button variant="outline" size="sm" className="border-green-300 text-green-700 hover:bg-green-100">
              Review →
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionSection({
  priority,
  actions,
  onRefresh,
}: {
  priority: "urgent" | "today" | "week";
  actions: TodayAction[];
  onRefresh: () => Promise<void>;
}) {
  const [bulkActing, setBulkActing] = useState(false);
  const config = PRIORITY_CONFIG[priority];

  const dismissableActions = actions.filter(
    (a) => DISMISSABLE_TYPES.has(a.type) && extractAppId(a.id)
  );
  const hasBulkActions = dismissableActions.length > 1;

  async function handleBulkSnooze() {
    setBulkActing(true);
    try {
      const results = await Promise.all(
        dismissableActions.map((a) => {
          const appId = extractAppId(a.id)!;
          return fetch(`/api/applications/${appId}/snooze`, { method: "POST" });
        })
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) {
        toast.error(`Snoozed ${results.length - failed}/${results.length} — ${failed} failed`);
      } else {
        toast.success(`Snoozed ${results.length} application${results.length !== 1 ? "s" : ""}`);
      }
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Snooze failed");
    } finally {
      setBulkActing(false);
    }
  }

  async function handleBulkArchive() {
    setBulkActing(true);
    try {
      const ids = dismissableActions.map((a) => extractAppId(a.id)!);
      const res = await fetch("/api/applications/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status: "withdrawn" }),
      });
      if (!res.ok) {
        throw new Error(`Archive failed (${res.status})`);
      }
      toast.success(`Archived ${ids.length} application${ids.length !== 1 ? "s" : ""}`);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBulkActing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.badge}`}
          >
            {config.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {actions.length} item{actions.length !== 1 ? "s" : ""}
          </span>
        </div>
        {hasBulkActions && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 px-2"
              onClick={handleBulkSnooze}
              disabled={bulkActing}
            >
              {bulkActing ? "Working..." : `Snooze All (${dismissableActions.length})`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 px-2"
              onClick={handleBulkArchive}
              disabled={bulkActing}
            >
              Archive All ({dismissableActions.length})
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {actions.map((action) => (
          <ActionCard key={action.id} action={action} config={config} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
}

/** Extract the real application UUID from an action ID like "decay-uuid" or "stalled-uuid" */
function extractAppId(actionId: string): string | null {
  const prefixes = ["decay-", "stalled-", "ready-", "overdue-", "referral-", "followup-today-", "first-followup-", "followup-week-"];
  for (const p of prefixes) {
    if (actionId.startsWith(p)) return actionId.slice(p.length);
  }
  return null;
}

/** Action types that support inline archive/snooze */
const DISMISSABLE_TYPES = new Set([
  "decay_warning", "decay_imminent", "stalled", "overdue_followup",
  "ready_to_apply", "needs_first_followup", "find_referral",
]);

function ActionCard({
  action,
  config,
  onRefresh,
}: {
  action: TodayAction;
  config: (typeof PRIORITY_CONFIG)[keyof typeof PRIORITY_CONFIG];
  onRefresh: () => Promise<void>;
}) {
  const [acting, setActing] = useState(false);
  const icon = ACTION_ICONS[action.type] ?? "📌";
  const isInsight = action.type === "insight";
  const isDismissable = DISMISSABLE_TYPES.has(action.type) || isInsight;
  const appId = extractAppId(action.id);

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (acting) return;
    setActing(true);
    try {
      if (isInsight) {
        const insightId = action.id.replace("insight-", "");
        const res = await fetch("/api/insights/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dismiss", ids: [insightId] }),
        });
        if (!res.ok) throw new Error(`Dismiss failed (${res.status})`);
        toast.success("Insight dismissed");
      } else if (appId) {
        const res = await fetch("/api/applications/bulk-status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [appId], status: "withdrawn" }),
        });
        if (!res.ok) throw new Error(`Archive failed (${res.status})`);
        toast.success(`Archived ${action.company || "application"}`);
      }
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setActing(false);
    }
  }

  async function handleSnooze(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!appId || acting) return;
    setActing(true);
    try {
      const res = await fetch(`/api/applications/${appId}/snooze`, { method: "POST" });
      if (!res.ok) throw new Error(`Snooze failed (${res.status})`);
      toast.success(`Snoozed ${action.company || "application"}`);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Snooze failed");
    } finally {
      setActing(false);
    }
  }

  return (
    <Link href={action.action_url}>
      <Card
        className={`${config.border} cursor-pointer transition-colors hover:${config.bg}`}
      >
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg flex-shrink-0">{icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {action.company && (
                  <span className="font-medium truncate">
                    {action.company}
                  </span>
                )}
                {action.role && (
                  <span className="text-sm text-muted-foreground truncate">
                    {action.role}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {action.detail}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
            {isDismissable && (appId || isInsight) && (
              <>
                {!isInsight && appId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-7 px-2"
                    onClick={handleSnooze}
                    disabled={acting}
                    tabIndex={-1}
                  >
                    Snooze
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-7 px-2"
                  onClick={handleArchive}
                  disabled={acting}
                  tabIndex={-1}
                >
                  {isInsight ? "Dismiss" : "Archive"}
                </Button>
              </>
            )}
            <Button
              variant={action.priority === "urgent" ? "default" : "outline"}
              size="sm"
              tabIndex={-1}
            >
              {action.action_label}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface InsightNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  priority: string;
  is_dismissed: boolean;
  created_at: string;
}

function InsightsSection({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [insights, setInsights] = useState<InsightNotification[]>([]);
  const [dismissedCount, setDismissedCount] = useState(0);
  const [showDismissed, setShowDismissed] = useState(false);
  const [acting, setActing] = useState(false);

  const loadInsights = useCallback(async () => {
    const res = await fetch(`/api/insights/notifications?dismissed=${showDismissed}`);
    if (res.ok) {
      const data = await res.json();
      setInsights(data.insights);
      setDismissedCount(data.dismissed_count);
    }
  }, [showDismissed]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  async function handleDismiss(id: string) {
    setActing(true);
    try {
      const res = await fetch("/api/insights/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", ids: [id] }),
      });
      if (!res.ok) throw new Error(`Dismiss failed (${res.status})`);
      await loadInsights();
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dismiss failed");
    } finally {
      setActing(false);
    }
  }

  async function handleDismissAll() {
    setActing(true);
    try {
      const res = await fetch("/api/insights/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss_all" }),
      });
      if (!res.ok) throw new Error(`Dismiss all failed (${res.status})`);
      toast.success("All insights dismissed");
      await loadInsights();
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dismiss all failed");
    } finally {
      setActing(false);
    }
  }

  async function handleRestore(id: string) {
    setActing(true);
    try {
      const res = await fetch("/api/insights/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", ids: [id] }),
      });
      if (!res.ok) throw new Error(`Restore failed (${res.status})`);
      await loadInsights();
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setActing(false);
    }
  }

  const activeInsights = insights.filter((i) => !i.is_dismissed);
  const displayInsights = showDismissed ? insights : activeInsights;

  if (displayInsights.length === 0 && dismissedCount === 0) return null;

  const CATEGORY_ICONS: Record<string, string> = {
    source_analysis: "📊",
    role_fit: "🎯",
    ghosting_pattern: "👻",
    score_correlation: "📈",
    pipeline_health: "🏥",
    weekly_summary: "📋",
    general: "💡",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700">
            Insights
          </span>
          <span className="text-xs text-muted-foreground">
            {activeInsights.length} active
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {activeInsights.length > 1 && !showDismissed && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 px-2"
              onClick={handleDismissAll}
              disabled={acting}
            >
              Dismiss All
            </Button>
          )}
          {dismissedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 px-2"
              onClick={() => setShowDismissed(!showDismissed)}
            >
              {showDismissed ? "Hide Dismissed" : `Show Dismissed (${dismissedCount})`}
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {displayInsights.map((insight) => (
          <Card
            key={insight.id}
            className={`border-purple-200 ${insight.is_dismissed ? "opacity-50" : ""}`}
          >
            <CardContent className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg flex-shrink-0">
                  {CATEGORY_ICONS[insight.category] ?? "💡"}
                </span>
                <div className="min-w-0">
                  <span className="font-medium text-sm">{insight.title}</span>
                  <p className="text-sm text-muted-foreground truncate">
                    {insight.message}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                {insight.is_dismissed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-7 px-2"
                    onClick={() => handleRestore(insight.id)}
                    disabled={acting}
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-7 px-2"
                    onClick={() => handleDismiss(insight.id)}
                    disabled={acting}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
