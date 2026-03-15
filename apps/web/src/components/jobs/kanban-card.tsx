"use client";

import { Badge } from "@/components/ui/badge";
import { SCORE_CONFIG } from "@/lib/constants";
import type { ApplicationWithScores, MatchScoreRow } from "@/types";

export function KanbanCard({ app }: { app: ApplicationWithScores }) {
  const score: MatchScoreRow | null = Array.isArray(app.match_scores)
    ? app.match_scores[0] ?? null
    : app.match_scores;
  const scoreCfg = score?.overall
    ? SCORE_CONFIG[score.overall as keyof typeof SCORE_CONFIG]
    : null;
  const matchPct = score?.match_percentage;

  return (
    <a
      href={`/dashboard/tracker/${app.id}`}
      className="block rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{app.company}</p>
          <p className="text-xs text-muted-foreground truncate">{app.role}</p>
        </div>
        {scoreCfg && (
          <span
            className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${scoreCfg.color}`}
          >
            {matchPct != null ? `${matchPct}%` : scoreCfg.label}
          </span>
        )}
      </div>
      {app.follow_up_date && (
        <p className="text-xs text-muted-foreground mt-1.5">
          Follow-up: {app.follow_up_date}
        </p>
      )}
    </a>
  );
}
