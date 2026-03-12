"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { STATUS_CONFIG, SCORE_CONFIG } from "@/lib/constants";
import type { ScoreTier } from "@/lib/constants";

interface DebriefNeeded {
  id: string;
  company: string;
  role: string;
  round: number;
  date: string;
  type: string;
}

interface DashboardStats {
  total: number;
  active: number;
  interviewing: number;
  offered: number;
  recent: {
    id: string;
    company: string;
    role: string;
    status: string;
    updated_at: string;
  }[];
  stalled: number;
  followups_due: number;
  debriefs_needed: DebriefNeeded[];
  pipeline_leads: {
    id: string;
    company: string;
    role: string;
    platform: string | null;
    match_score: number | null;
    match_tier: string | null;
    created_at: string;
    email_date: string | null;
  }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{
    connected: boolean;
    last_fetch_at: string | null;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard-stats");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setStats(data);
      } catch {
        // silent fail
      }
      setLoading(false);
    }
    load();

    fetch("/api/gmail/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) =>
        setEmailStatus({
          connected: !!data?.is_active,
          last_fetch_at: data?.last_fetch_at ?? null,
        })
      )
      .catch(() => setEmailStatus({ connected: false, last_fetch_at: null }));
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Sync complete — ${data.inserted} new lead${data.inserted !== 1 ? "s" : ""} found`
        );
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Sync failed");
      }
      // Refresh status
      const updated = await fetch("/api/gmail/status");
      if (updated.ok) {
        const data = await updated.json();
        setEmailStatus({
          connected: !!data?.is_active,
          last_fetch_at: data?.last_fetch_at ?? null,
        });
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  const s = stats ?? {
    total: 0,
    active: 0,
    interviewing: 0,
    offered: 0,
    recent: [],
    stalled: 0,
    followups_due: 0,
    debriefs_needed: [],
    pipeline_leads: [],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        {emailStatus?.connected && (
          <div className="flex items-center gap-3">
            {emailStatus.last_fetch_at && (
              <span className="text-xs text-muted-foreground">
                Last sync: {new Date(emailStatus.last_fetch_at).toLocaleDateString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync Email"}
            </Button>
          </div>
        )}
      </div>

      {/* Alert cards */}
      {(s.stalled > 0 || s.followups_due > 0 || s.debriefs_needed.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {s.debriefs_needed.length > 0 && (
            <Link href={`/dashboard/tracker/${s.debriefs_needed[0].id}`}>
              <Card className="border-purple-300 flex-1 cursor-pointer transition-colors hover:bg-purple-50">
                <CardContent className="py-3">
                  <p className="text-sm text-purple-700 font-medium">
                    {s.debriefs_needed.length} interview{s.debriefs_needed.length > 1 ? "s" : ""} need{s.debriefs_needed.length === 1 ? "s" : ""} debrief
                  </p>
                  <p className="text-xs text-purple-500 mt-1">
                    {s.debriefs_needed.map((d) => `${d.company} R${d.round}`).join(", ")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}
          {s.stalled > 0 && (
            <Link href="/dashboard/tracker?status=applied">
              <Card className="border-yellow-300 flex-1 cursor-pointer transition-colors hover:bg-yellow-50">
                <CardContent className="py-3">
                  <p className="text-sm text-yellow-700 font-medium">
                    {s.stalled} stalled application{s.stalled > 1 ? "s" : ""}{" "}
                    (21+ days)
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}
          {s.followups_due > 0 && (
            <Link href="/dashboard/tracker?status=applied,interviewing">
              <Card className="border-blue-300 flex-1 cursor-pointer transition-colors hover:bg-blue-50">
                <CardContent className="py-3">
                  <p className="text-sm text-blue-700 font-medium">
                    {s.followups_due} follow-up{s.followups_due > 1 ? "s" : ""}{" "}
                    due
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/tracker">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.total}</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/tracker?status=applied,interviewing">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.active}</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/tracker?status=interviewing">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Interviews
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.interviewing}</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/tracker?status=offered,accepted">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Offers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.offered}</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {s.pipeline_leads.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>New Pipeline Leads</CardTitle>
            <Link href="/dashboard/pipeline">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {s.pipeline_leads.map((lead) => {
                const scoreCfg = lead.match_tier
                  ? SCORE_CONFIG[lead.match_tier as ScoreTier]
                  : null;
                return (
                  <Link
                    key={lead.id}
                    href="/dashboard/pipeline"
                    className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded"
                  >
                    <div>
                      <span className="font-medium">{lead.company}</span>
                      <span className="text-muted-foreground ml-2 text-sm">{lead.role}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {scoreCfg && (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${scoreCfg.color}`}>
                          {scoreCfg.label} {lead.match_score != null && `${lead.match_score}%`}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(lead.email_date ?? lead.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {s.recent.length === 0 ? (
            <p className="text-muted-foreground">
              No activity yet. Start by setting up your profile, then analyze
              a job posting or add an application.
            </p>
          ) : (
            <div className="space-y-2">
              {s.recent.map((app) => {
                const cfg =
                  STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG];
                return (
                  <Link
                    key={app.id}
                    href={`/dashboard/tracker/${app.id}`}
                    className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded"
                  >
                    <div>
                      <span className="font-medium">{app.company}</span>
                      <span className="text-muted-foreground ml-2 text-sm">
                        {app.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={cfg?.variant ?? "secondary"}>
                        {cfg?.label ?? app.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(app.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
