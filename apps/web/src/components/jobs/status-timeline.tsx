"use client";

import { Badge } from "@/components/ui/badge";
import { STATUS_CONFIG } from "@/lib/constants";
import type { ApplicationStatus } from "@/lib/constants";
import type { StatusHistoryRow } from "@/types";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  promotion: "Promoted from lead",
  extension: "Browser extension",
  email_detection: "Email detected",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StatusTimeline({ history }: { history: StatusHistoryRow[] }) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
    );
  }

  const sorted = [...history].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
  );

  return (
    <div className="relative space-y-0">
      {sorted.map((entry, i) => {
        const toCfg = STATUS_CONFIG[entry.to_status as ApplicationStatus];
        const isLast = i === sorted.length - 1;

        return (
          <div key={entry.id} className="flex gap-3">
            {/* Vertical line + dot */}
            <div className="flex flex-col items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                  isLast ? "bg-primary" : "bg-muted-foreground/40"
                }`}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-border min-h-[24px]" />
              )}
            </div>

            {/* Content */}
            <div className="pb-4 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {entry.from_status && (
                  <>
                    <Badge variant="outline" className="text-xs">
                      {STATUS_CONFIG[entry.from_status as ApplicationStatus]?.label ?? entry.from_status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">&rarr;</span>
                  </>
                )}
                <Badge variant={toCfg?.variant ?? "secondary"} className="text-xs">
                  {toCfg?.label ?? entry.to_status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {formatDate(entry.changed_at)}
                </span>
                {entry.source !== "manual" && (
                  <span className="text-xs text-muted-foreground">
                    &middot; {SOURCE_LABELS[entry.source] ?? entry.source}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
