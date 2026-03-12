"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { SCORE_CONFIG } from "@/lib/constants";
import type { PipelineLeadRow } from "@/types";

function ScoreTooltipBody({
  redFlags,
  scoreDetails,
}: {
  redFlags: string[];
  scoreDetails: Record<string, unknown> | null;
}) {
  const hasFlags = redFlags?.length > 0;
  const parsed =
    typeof scoreDetails === "string"
      ? (() => {
          try {
            return JSON.parse(scoreDetails);
          } catch {
            return null;
          }
        })()
      : scoreDetails;
  const detailEntries =
    parsed && typeof parsed === "object"
      ? Object.entries(parsed).filter(
          ([, v]) => v !== null && v !== undefined && v !== ""
        )
      : [];
  const hasDetails = detailEntries.length > 0;

  if (!hasFlags && !hasDetails) {
    return <span>No scoring details available</span>;
  }

  return (
    <div className="space-y-2 py-1">
      {hasDetails && (
        <div>
          {detailEntries.map(([key, value]) => {
            const isNumeric = typeof value === "number";
            return (
              <div
                key={key}
                className={`flex gap-3 ${isNumeric ? "justify-between whitespace-nowrap" : "flex-col"}`}
              >
                <span className="text-muted-foreground capitalize shrink-0">
                  {key.replace(/_/g, " ")}:
                </span>
                <span
                  className={`font-medium ${isNumeric ? "" : "break-words"}`}
                >
                  {String(value)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {hasFlags && (
        <div>
          <div className="font-medium text-destructive mb-0.5">Red flags:</div>
          <ul className="list-disc pl-3.5 space-y-0.5">
            {redFlags.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface LeadCardProps {
  lead: PipelineLeadRow;
  rescoringId: string | null;
  reparsingId: string | null;
  onRescore: (id: string) => void;
  onReparse: (id: string) => void;
  onPromote: (id: string) => void;
  onSkip: (id: string) => void;
}

export function LeadCard({
  lead,
  rescoringId,
  reparsingId,
  onRescore,
  onReparse,
  onPromote,
  onSkip,
}: LeadCardProps) {
  const scoreCfg = lead.score_overall
    ? SCORE_CONFIG[lead.score_overall as keyof typeof SCORE_CONFIG]
    : null;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {lead.rank && (
                <span className="text-sm font-mono text-muted-foreground">
                  #{lead.rank}
                </span>
              )}
              <h3 className="font-semibold truncate">{lead.company}</h3>
              {scoreCfg && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`inline-flex cursor-help rounded-full px-2 py-0.5 text-xs font-medium ${scoreCfg.color}`}
                    >
                      {scoreCfg.label}
                      {lead.score_match_percentage != null &&
                        ` ${lead.score_match_percentage}%`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    className="min-w-[200px] max-w-sm text-left"
                    side="bottom"
                  >
                    <ScoreTooltipBody
                      redFlags={lead.red_flags}
                      scoreDetails={lead.score_details}
                    />
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {lead.role}
            </p>
            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
              {lead.source_platform && <span>{lead.source_platform}</span>}
              {lead.location && <span>| {lead.location}</span>}
              {(lead.email_date || lead.created_at) && (
                <span>
                  |{" "}
                  {new Date(
                    lead.email_date ?? lead.created_at
                  ).toLocaleDateString()}
                </span>
              )}
            </div>
            {lead.red_flags?.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {lead.red_flags.map((f, i) => (
                  <Badge key={i} variant="destructive" className="text-xs">
                    {f}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {lead.status === "pending_review" && (
            <div className="flex gap-2 shrink-0">
              {(lead.score_match_percentage === 0 ||
                lead.score_match_percentage == null) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rescoringId === lead.id}
                  onClick={() => onRescore(lead.id)}
                >
                  {rescoringId === lead.id ? "Scoring..." : "Score"}
                </Button>
              )}
              {lead.description_text && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reparsingId === lead.id}
                  onClick={() => onReparse(lead.id)}
                >
                  {reparsingId === lead.id ? "Reparsing..." : "Reparse"}
                </Button>
              )}
              <Button size="sm" onClick={() => onPromote(lead.id)}>
                Promote
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSkip(lead.id)}
              >
                Skip
              </Button>
            </div>
          )}
          {lead.status !== "pending_review" && (
            <Badge
              variant={lead.status === "promoted" ? "default" : "secondary"}
            >
              {lead.status}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
