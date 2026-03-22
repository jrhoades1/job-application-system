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

/** Parse score_details safely, handling both string and object forms */
function parseScoreDetails(raw: Record<string, unknown> | null) {
  const parsed =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : raw;

  if (!parsed || typeof parsed !== "object") return null;

  return {
    strong_count: (parsed.strong_count as number) ?? 0,
    partial_count: (parsed.partial_count as number) ?? 0,
    gap_count: (parsed.gap_count as number) ?? 0,
    strengths: Array.isArray(parsed.strengths) ? (parsed.strengths as string[]) : [],
    partials: Array.isArray(parsed.partials) ? (parsed.partials as string[]) : [],
    gaps: Array.isArray(parsed.gaps) ? (parsed.gaps as string[]) : [],
    score_source: (parsed.score_source as "scored" | "estimated") ?? "scored",
  };
}

/** Truncate a requirement string to a short label */
function shortLabel(req: string, maxLen = 40): string {
  // Strip common prefixes like "5+ years of experience in"
  const cleaned = req
    .replace(/^\d+\+?\s*years?\s*(of\s*)?(experience\s*)?(in\s*|with\s*)?/i, "")
    .replace(/^(proven|demonstrated|strong|deep|extensive|solid)\s+(experience|knowledge|understanding|ability|track record)\s*(in\s*|of\s*|with\s*)?/i, "")
    .trim();
  const label = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return label.length > maxLen ? label.slice(0, maxLen - 1) + "…" : label;
}

function ScoreTooltipBody({
  redFlags,
  details,
}: {
  redFlags: string[];
  details: ReturnType<typeof parseScoreDetails>;
}) {
  const hasFlags = redFlags?.length > 0;

  if (!details && !hasFlags) {
    return <span>No scoring details available</span>;
  }

  return (
    <div className="space-y-2 py-1 text-xs">
      {details?.score_source === "estimated" && (
        <div className="text-muted-foreground italic">
          Estimated from role title — no full JD available
        </div>
      )}
      {details && details.strengths.length > 0 && (
        <div>
          <div className="font-medium text-green-700 mb-0.5">
            Strong matches ({details.strong_count})
          </div>
          <ul className="list-disc pl-3.5 space-y-0.5">
            {details.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {details && details.partials.length > 0 && (
        <div>
          <div className="font-medium text-yellow-700 mb-0.5">
            Partial matches ({details.partial_count})
          </div>
          <ul className="list-disc pl-3.5 space-y-0.5">
            {details.partials.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {details && details.gaps.length > 0 && (
        <div>
          <div className="font-medium text-red-600 mb-0.5">
            Gaps ({details.gap_count})
          </div>
          <ul className="list-disc pl-3.5 space-y-0.5">
            {details.gaps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
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
  onClick?: (lead: PipelineLeadRow) => void;
}

export function LeadCard({
  lead,
  rescoringId,
  reparsingId,
  onRescore,
  onReparse,
  onPromote,
  onSkip,
  onClick,
}: LeadCardProps) {
  const scoreCfg = lead.score_overall
    ? SCORE_CONFIG[lead.score_overall as keyof typeof SCORE_CONFIG]
    : null;

  const details = parseScoreDetails(lead.score_details);

  // Pick top strengths and gaps to show inline
  const topStrengths = details?.strengths.slice(0, 3).map((s) => shortLabel(s)) ?? [];
  const topGaps = details?.gaps.slice(0, 2).map((s) => shortLabel(s)) ?? [];

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={() => onClick?.(lead)}
    >
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Row 1: Company + Score Badge */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{lead.company}</h3>
              {scoreCfg && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`inline-flex cursor-help rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${scoreCfg.color}`}
                    >
                      {scoreCfg.label}
                      {details?.score_source === "estimated"
                        ? " ~"
                        : lead.score_match_percentage != null
                          ? ` ${lead.score_match_percentage}%`
                          : ""}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    className="min-w-[220px] max-w-md text-left"
                    side="bottom"
                  >
                    <ScoreTooltipBody
                      redFlags={lead.red_flags}
                      details={details}
                    />
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Row 2: Role */}
            <p className="text-sm text-muted-foreground truncate">
              {lead.role}
            </p>

            {/* Row 3: Metadata — source, location, remote, compensation, date */}
            <div className="flex gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
              {lead.source_platform && <span>{lead.source_platform}</span>}
              {lead.location && (
                <span>{lead.source_platform ? `| ${lead.location}` : lead.location}</span>
              )}
              {lead.remote_status && (
                <span className="text-blue-600 font-medium">
                  | {lead.remote_status}
                </span>
              )}
              {lead.compensation && (
                <span className="text-green-700 font-medium">
                  | {lead.compensation}
                </span>
              )}
              {(lead.email_date || lead.created_at) && (
                <span>
                  |{" "}
                  {new Date(
                    lead.email_date ?? lead.created_at
                  ).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Row 4: Strengths + Gaps (the decision-making info) */}
            {(topStrengths.length > 0 || topGaps.length > 0) && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {topStrengths.map((s, i) => (
                  <Badge
                    key={`s-${i}`}
                    variant="outline"
                    className="text-xs bg-green-50 text-green-700 border-green-200"
                  >
                    {s}
                  </Badge>
                ))}
                {topGaps.map((g, i) => (
                  <Badge
                    key={`g-${i}`}
                    variant="outline"
                    className="text-xs bg-red-50 text-red-600 border-red-200"
                  >
                    Gap: {g}
                  </Badge>
                ))}
              </div>
            )}

            {/* Row 5: Red flags */}
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
            <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              {(lead.score_match_percentage === 0 ||
                lead.score_match_percentage == null ||
                (lead.red_flags?.length > 0)) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rescoringId === lead.id}
                  onClick={() => onRescore(lead.id)}
                >
                  {rescoringId === lead.id ? "Scoring..." : lead.red_flags?.length > 0 ? "Rescore" : "Score"}
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
