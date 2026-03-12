"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { SCORE_CONFIG } from "@/lib/constants";
import type { PipelineLeadRow } from "@/types";
import { ExternalLink } from "lucide-react";

interface LeadDetailSheetProps {
  lead: PipelineLeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rescoringId: string | null;
  reparsingId: string | null;
  onRescore: (id: string) => void;
  onReparse: (id: string) => void;
  onPromote: (id: string) => void;
  onSkip: (id: string) => void;
}

export function LeadDetailSheet({
  lead,
  open,
  onOpenChange,
  rescoringId,
  reparsingId,
  onRescore,
  onReparse,
  onPromote,
  onSkip,
}: LeadDetailSheetProps) {
  if (!lead) return null;

  const scoreCfg = lead.score_overall
    ? SCORE_CONFIG[lead.score_overall as keyof typeof SCORE_CONFIG]
    : null;

  const scoreDetails =
    typeof lead.score_details === "string"
      ? (() => {
          try {
            return JSON.parse(lead.score_details);
          } catch {
            return null;
          }
        })()
      : lead.score_details;

  const detailEntries =
    scoreDetails && typeof scoreDetails === "object"
      ? Object.entries(scoreDetails).filter(
          ([, v]) => v !== null && v !== undefined && v !== ""
        )
      : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle className="text-xl">{lead.company}</SheetTitle>
            {scoreCfg && (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${scoreCfg.color}`}
              >
                {scoreCfg.label}
                {lead.score_match_percentage != null &&
                  ` ${lead.score_match_percentage}%`}
              </span>
            )}
          </div>
          <SheetDescription className="text-base font-medium text-foreground">
            {lead.role}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {/* Metadata */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {lead.source_platform && <span>{lead.source_platform}</span>}
            {lead.location && <span>{lead.location}</span>}
            {(lead.email_date || lead.created_at) && (
              <span>
                {new Date(
                  lead.email_date ?? lead.created_at
                ).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Career page link */}
          {lead.career_page_url && (
            <a
              href={lead.career_page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Original Posting
            </a>
          )}

          {/* Red flags */}
          {lead.red_flags?.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Red Flags</h4>
              <div className="flex gap-1.5 flex-wrap">
                {lead.red_flags.map((f, i) => (
                  <Badge key={i} variant="destructive" className="text-xs">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Score breakdown */}
          {detailEntries.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Score Breakdown</h4>
              <div className="rounded-lg border p-3 space-y-1.5">
                {detailEntries.map(([key, value]) => {
                  const isNumeric = typeof value === "number";
                  return (
                    <div
                      key={key}
                      className={`flex gap-3 text-sm ${isNumeric ? "justify-between" : "flex-col"}`}
                    >
                      <span className="text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium">{String(value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Job description */}
          {lead.description_text ? (
            <div>
              <h4 className="text-sm font-medium mb-2">Job Description</h4>
              <div className="rounded-lg border p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">
                {lead.description_text}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground text-center">
              No job description available. Try reparsing this lead.
            </div>
          )}

          {/* Actions */}
          {lead.status === "pending_review" && (
            <div className="flex gap-2 pt-2">
              {(lead.score_match_percentage === 0 ||
                lead.score_match_percentage == null ||
                lead.red_flags?.length > 0) && (
                <Button
                  variant="outline"
                  disabled={rescoringId === lead.id}
                  onClick={() => onRescore(lead.id)}
                >
                  {rescoringId === lead.id
                    ? "Scoring..."
                    : lead.red_flags?.length > 0
                      ? "Rescore"
                      : "Score"}
                </Button>
              )}
              {lead.description_text && (
                <Button
                  variant="outline"
                  disabled={reparsingId === lead.id}
                  onClick={() => onReparse(lead.id)}
                >
                  {reparsingId === lead.id ? "Reparsing..." : "Reparse"}
                </Button>
              )}
              <Button onClick={() => onPromote(lead.id)}>Promote</Button>
              <Button variant="outline" onClick={() => onSkip(lead.id)}>
                Skip
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
