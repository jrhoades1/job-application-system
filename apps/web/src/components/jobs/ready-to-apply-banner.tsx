"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { detectATS } from "@/lib/ats-detect";
import type { ApplicationWithScores, MatchScoreRow } from "@/types";

interface ReadyToApplyBannerProps {
  app: ApplicationWithScores;
  score: MatchScoreRow | null;
  onTailorResume: () => void;
  onGenerateCoverLetter: () => void;
  onScore: () => void;
  onMarkApplied: () => void;
  tailoring: boolean;
  generatingCL: boolean;
  scoring: boolean;
  applying: boolean;
}

export function ReadyToApplyBanner({
  app,
  score,
  onTailorResume,
  onGenerateCoverLetter,
  onScore,
  onMarkApplied,
  tailoring,
  generatingCL,
  scoring,
  applying,
}: ReadyToApplyBannerProps) {
  const hasResume = !!(app.tailored_resume || app.resume_version);
  const hasCoverLetter = !!app.cover_letter;
  const hasScore = !!score;
  const ats = detectATS(app.source_url);

  const checklistItems = [
    {
      label: "Score",
      done: hasScore,
      action: hasScore ? undefined : onScore,
      actionLabel: scoring ? "Scoring..." : "Score Now",
      actionDisabled: scoring || !app.job_description,
    },
    {
      label: "Resume tailored",
      done: hasResume,
      action: hasResume ? undefined : onTailorResume,
      actionLabel: tailoring ? "Tailoring..." : "Tailor Resume",
      actionDisabled: tailoring,
    },
    {
      label: "Cover letter",
      done: hasCoverLetter,
      action: hasCoverLetter ? undefined : onGenerateCoverLetter,
      actionLabel: generatingCL ? "Generating..." : "Generate",
      actionDisabled: generatingCL,
    },
  ];

  const allReady = hasScore && hasResume && hasCoverLetter;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Ready to Apply</h3>
            {ats && (
              <Badge variant="outline" className="text-xs">
                {ats.label}
              </Badge>
            )}
          </div>
          {app.source_url && (
            <Button asChild size="lg" className="gap-2">
              <a href={app.source_url} target="_blank" rel="noopener noreferrer">
                Apply Now
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </Button>
          )}
        </div>

        {/* Pre-apply checklist */}
        <div className="flex flex-wrap gap-4">
          {checklistItems.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={`text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}>
                {item.done ? "\u2705" : "\u2B1C"} {item.label}
              </span>
              {!item.done && item.action && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={item.action}
                  disabled={item.actionDisabled}
                >
                  {item.actionLabel}
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Apply action row */}
        <div className="flex items-center gap-3 pt-1">
          {!app.source_url && (
            <p className="text-sm text-muted-foreground">
              No application URL available — add one via the source URL field.
            </p>
          )}
          <Button
            variant={allReady ? "default" : "outline"}
            onClick={onMarkApplied}
            disabled={applying}
          >
            {applying ? "Updating..." : "I Applied"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Sets status, date, and 7-day follow-up automatically
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
