"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGmailSync } from "@/hooks/use-gmail-sync";

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
  ready_to_apply: "📄",
  stalled: "⏳",
  followup_this_week: "📅",
  decay_warning: "⚠️",
  decay_imminent: "🚨",
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
        <ActionSection priority="urgent" actions={urgent} />
      )}
      {today.length > 0 && (
        <ActionSection priority="today" actions={today} />
      )}
      {week.length > 0 && <ActionSection priority="week" actions={week} />}

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
}: {
  priority: "urgent" | "today" | "week";
  actions: TodayAction[];
}) {
  const config = PRIORITY_CONFIG[priority];

  return (
    <div className="space-y-2">
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
      <div className="space-y-2">
        {actions.map((action) => (
          <ActionCard key={action.id} action={action} config={config} />
        ))}
      </div>
    </div>
  );
}

function ActionCard({
  action,
  config,
}: {
  action: TodayAction;
  config: (typeof PRIORITY_CONFIG)[keyof typeof PRIORITY_CONFIG];
}) {
  const icon = ACTION_ICONS[action.type] ?? "📌";

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
          <Button
            variant={action.priority === "urgent" ? "default" : "outline"}
            size="sm"
            className="flex-shrink-0 ml-3"
            tabIndex={-1}
          >
            {action.action_label}
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}
