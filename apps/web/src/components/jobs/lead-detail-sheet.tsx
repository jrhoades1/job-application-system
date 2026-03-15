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
import { useMemo } from "react";

/** Parse score_details safely */
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
    strengths: (parsed.strengths as string[]) ?? [],
    partials: (parsed.partials as string[]) ?? [],
    gaps: (parsed.gaps as string[]) ?? [],
  };
}

/** Clean raw email/HTML content into readable plain text */
function cleanDescription(raw: string): string {
  let text = raw;

  // Decode URL-encoded content (e.g. %20, %3C)
  try {
    if (/%[0-9A-Fa-f]{2}/.test(text)) {
      text = decodeURIComponent(text.replace(/\+/g, " "));
    }
  } catch {
    // partial encoding — ignore
  }

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");

  // Strip HTML tags but preserve block-level breaks
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  // Remove long URLs (tracking links, etc.)
  text = text.replace(/https?:\/\/\S{80,}/g, "[link]");

  // Collapse excessive whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

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

  const details = parseScoreDetails(lead.score_details);
  const cleanedDescription = useMemo(
    () => (lead.description_text ? cleanDescription(lead.description_text) : null),
    [lead.description_text]
  );

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
            {lead.remote_status && (
              <span className="text-blue-600 font-medium">{lead.remote_status}</span>
            )}
            {lead.compensation && (
              <span className="text-green-700 font-medium">{lead.compensation}</span>
            )}
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

          {/* Score breakdown — rich version */}
          {details && (details.strengths.length > 0 || details.partials.length > 0 || details.gaps.length > 0) ? (
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Score Breakdown</h4>

              {/* Summary bar */}
              <div className="flex gap-4 text-sm">
                <span className="text-green-700 font-medium">
                  {details.strong_count} strong
                </span>
                <span className="text-yellow-700 font-medium">
                  {details.partial_count} partial
                </span>
                <span className="text-red-600 font-medium">
                  {details.gap_count} gap{details.gap_count !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Strong matches */}
              {details.strengths.length > 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-3">
                  <div className="text-xs font-medium text-green-800 mb-1.5">
                    Strong Matches
                  </div>
                  <ul className="space-y-1">
                    {details.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-green-900 flex items-start gap-1.5">
                        <span className="text-green-600 mt-0.5 shrink-0">&#10003;</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Partial matches */}
              {details.partials.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50/50 p-3">
                  <div className="text-xs font-medium text-yellow-800 mb-1.5">
                    Partial Matches
                  </div>
                  <ul className="space-y-1">
                    {details.partials.map((s, i) => (
                      <li key={i} className="text-sm text-yellow-900 flex items-start gap-1.5">
                        <span className="text-yellow-600 mt-0.5 shrink-0">~</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps */}
              {details.gaps.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                  <div className="text-xs font-medium text-red-800 mb-1.5">
                    Gaps — You Don&apos;t Have This
                  </div>
                  <ul className="space-y-1">
                    {details.gaps.map((s, i) => (
                      <li key={i} className="text-sm text-red-900 flex items-start gap-1.5">
                        <span className="text-red-500 mt-0.5 shrink-0">&#10007;</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : details ? (
            /* Fallback: counts only (legacy data without requirement names) */
            <div>
              <h4 className="text-sm font-medium mb-2">Score Breakdown</h4>
              <div className="rounded-lg border p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Strong matches</span>
                  <span className="font-medium text-green-700">{details.strong_count}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Partial matches</span>
                  <span className="font-medium text-yellow-700">{details.partial_count}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gaps</span>
                  <span className="font-medium text-red-600">{details.gap_count}</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Job description */}
          {cleanedDescription ? (
            <div>
              <h4 className="text-sm font-medium mb-2">Job Description</h4>
              <div className="rounded-lg border p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">
                {cleanedDescription}
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
