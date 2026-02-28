"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_CONFIG } from "@/lib/constants";

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
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/applications?limit=50");
        const apps = await res.json();
        const list = Array.isArray(apps) ? apps : apps.data ?? [];

        const now = Date.now();
        const active = list.filter((a: { status: string }) =>
          ["applied", "interviewing", "bookmarked"].includes(a.status)
        );
        const interviewing = list.filter(
          (a: { status: string }) => a.status === "interviewing"
        );
        const offered = list.filter((a: { status: string }) =>
          ["offered", "accepted"].includes(a.status)
        );

        const stalled = list.filter((a: { status: string; applied_date: string | null; created_at: string }) => {
          if (a.status !== "applied") return false;
          const date = a.applied_date
            ? new Date(a.applied_date).getTime()
            : new Date(a.created_at).getTime();
          return now - date > 21 * 24 * 60 * 60 * 1000;
        });

        const followups = list.filter((a: { follow_up_date: string | null }) => {
          if (!a.follow_up_date) return false;
          return new Date(a.follow_up_date).getTime() <= now;
        });

        const recent = [...list]
          .sort(
            (a: { updated_at: string }, b: { updated_at: string }) =>
              new Date(b.updated_at).getTime() -
              new Date(a.updated_at).getTime()
          )
          .slice(0, 5);

        setStats({
          total: list.length,
          active: active.length,
          interviewing: interviewing.length,
          offered: offered.length,
          recent,
          stalled: stalled.length,
          followups_due: followups.length,
        });
      } catch {
        // silent fail
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  const s = stats ?? {
    total: 0,
    active: 0,
    interviewing: 0,
    offered: 0,
    recent: [],
    stalled: 0,
    followups_due: 0,
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Alert cards */}
      {(s.stalled > 0 || s.followups_due > 0) && (
        <div className="flex gap-3">
          {s.stalled > 0 && (
            <Card className="border-yellow-300 flex-1">
              <CardContent className="py-3">
                <p className="text-sm text-yellow-700 font-medium">
                  {s.stalled} stalled application{s.stalled > 1 ? "s" : ""}{" "}
                  (21+ days)
                </p>
              </CardContent>
            </Card>
          )}
          {s.followups_due > 0 && (
            <Card className="border-blue-300 flex-1">
              <CardContent className="py-3">
                <p className="text-sm text-blue-700 font-medium">
                  {s.followups_due} follow-up{s.followups_due > 1 ? "s" : ""}{" "}
                  due
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{s.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{s.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Interviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{s.interviewing}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Offers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{s.offered}</div>
          </CardContent>
        </Card>
      </div>

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
