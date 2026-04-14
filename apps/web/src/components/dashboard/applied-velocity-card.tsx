"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { describeWindow, type VelocityWindow } from "@/lib/date-windows";

interface SeriesPoint {
  bucket: string;
  count: number;
}

interface VelocityResponse {
  window: VelocityWindow;
  count: number;
  prev_count: number | null;
  delta: number | null;
  most_recent: string | null;
  series: SeriesPoint[];
  range: { start: string | null; end: string };
}

const WINDOWS: { value: VelocityWindow; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All" },
];

const STORAGE_KEY = "applied-velocity-window";

function humanizeDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso + "T00:00:00Z");
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = Math.round((todayUtc - d.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function loadInitialWindow(): VelocityWindow {
  if (typeof window === "undefined") return "week";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (WINDOWS.map((w) => w.value) as string[]).includes(stored)) {
    return stored as VelocityWindow;
  }
  return "week";
}

export function AppliedVelocityCard() {
  const [selected, setSelected] = useState<VelocityWindow>("week");
  const [data, setData] = useState<VelocityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Hydrate from localStorage after mount to stay SSR-safe.
  useEffect(() => {
    const hydrated = loadInitialWindow();
    if (hydrated !== "week") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(hydrated);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);
    fetch(`/api/applied-velocity?window=${selected}`)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((d: VelocityResponse) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  function selectWindow(w: VelocityWindow) {
    setSelected(w);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, w);
    }
  }

  const sparkMax = useMemo(() => {
    if (!data || data.series.length === 0) return 1;
    return Math.max(1, ...data.series.map((s) => s.count));
  }, [data]);

  const jobsHref = useMemo(() => {
    if (!data) return "/dashboard/jobs?tab=applied";
    const params = new URLSearchParams({ tab: "applied" });
    if (data.range.start) params.set("from", data.range.start);
    params.set("to", data.range.end);
    return `/dashboard/jobs?${params.toString()}`;
  }, [data]);

  const deltaLabel = useMemo(() => {
    if (!data || data.delta === null) return null;
    const d = data.delta;
    if (d === 0) return "— same as last period";
    const sign = d > 0 ? "▲" : "▼";
    const color = d > 0 ? "text-emerald-600" : "text-red-600";
    return (
      <span className={color}>
        {sign} {Math.abs(d)} vs last {selected === "ytd" ? "year" : selected}
      </span>
    );
  }, [data, selected]);

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        {/* Toggle */}
        <div
          role="tablist"
          aria-label="Applied velocity time window"
          data-testid="velocity-window-toggle"
          className="flex gap-1 rounded-md bg-muted/60 p-1 w-fit"
        >
          {WINDOWS.map((w) => (
            <Button
              key={w.value}
              role="tab"
              aria-selected={selected === w.value}
              variant={selected === w.value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => selectWindow(w.value)}
            >
              {w.label}
            </Button>
          ))}
        </div>

        {/* Count + delta + drill-in */}
        <div className="flex items-end justify-between gap-4">
          <Link href={jobsHref} className="group flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              Applied · {describeWindow(selected)}
            </p>
            <p
              className="text-4xl font-bold tabular-nums group-hover:text-primary transition-colors"
              data-testid="velocity-count"
            >
              {loading ? "…" : error ? "—" : (data?.count ?? 0)}
            </p>
            {!loading && !error && data && (
              <p className="text-xs text-muted-foreground mt-1">
                {deltaLabel} {deltaLabel && data.most_recent ? "· " : ""}
                {data.most_recent ? `last ${humanizeDate(data.most_recent)}` : "no activity"}
              </p>
            )}
          </Link>

          {/* Sparkline */}
          {!loading && !error && data && data.series.length > 0 && (
            <div
              className="flex items-end gap-0.5 h-12"
              aria-hidden="true"
              data-testid="velocity-sparkline"
            >
              {data.series.map((s) => {
                const h = Math.round((s.count / sparkMax) * 100);
                return (
                  <div
                    key={s.bucket}
                    className="w-1.5 bg-primary/70 rounded-sm"
                    style={{ height: `${Math.max(h, 4)}%` }}
                    title={`${s.bucket}: ${s.count}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
