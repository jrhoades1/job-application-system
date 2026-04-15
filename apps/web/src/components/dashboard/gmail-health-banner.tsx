"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface GmailStatus {
  email_address: string;
  last_fetch_at: string | null;
  is_active: boolean;
  health: "ok" | "stale" | "refresh_failing" | "disconnected";
  refresh_failure_count: number;
  last_refresh_error: string | null;
  last_refresh_error_at: string | null;
}

function humanizeTimestamp(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function GmailHealthBanner() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gmail/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setStatus(d);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing to show until we've loaded, and nothing to warn about when healthy
  // or when Gmail isn't connected at all (the connect-Gmail nudge lives in
  // Settings — we don't want to duplicate it here).
  if (!loaded || !status || !status.is_active || status.health === "ok") {
    return null;
  }

  const isRefreshFailing = status.health === "refresh_failing";

  const bannerClass = isRefreshFailing
    ? "border-red-300 bg-red-50"
    : "border-amber-300 bg-amber-50";
  const textClass = isRefreshFailing ? "text-red-800" : "text-amber-800";
  const titleClass = isRefreshFailing ? "text-red-900" : "text-amber-900";

  const title = isRefreshFailing
    ? "Gmail token refresh is failing"
    : "Gmail sync looks stale";

  const detail = isRefreshFailing
    ? `Last error ${humanizeTimestamp(status.last_refresh_error_at)} · ${status.refresh_failure_count} recent failure${status.refresh_failure_count !== 1 ? "s" : ""} · new rejections and leads won't flow until you reconnect.`
    : `Last successful fetch ${humanizeTimestamp(status.last_fetch_at)}. If this keeps happening, reconnect Gmail or check the cron.`;

  return (
    <Card className={bannerClass} data-testid="gmail-health-banner">
      <CardContent className="py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${titleClass}`}>{title}</p>
            <p className={`text-xs mt-0.5 ${textClass}`}>{detail}</p>
            {isRefreshFailing && status.last_refresh_error && (
              <p className="text-xs mt-1 font-mono text-red-700 truncate">
                {status.last_refresh_error}
              </p>
            )}
          </div>
          <Button asChild size="sm" variant={isRefreshFailing ? "default" : "outline"}>
            <Link href="/dashboard/settings?tab=gmail">
              {isRefreshFailing ? "Reconnect Gmail" : "Open Settings"}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
