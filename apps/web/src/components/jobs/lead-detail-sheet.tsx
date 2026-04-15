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
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";

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
    strengths: Array.isArray(parsed.strengths) ? (parsed.strengths as string[]) : [],
    partials: Array.isArray(parsed.partials) ? (parsed.partials as string[]) : [],
    gaps: Array.isArray(parsed.gaps) ? (parsed.gaps as string[]) : [],
    score_source: (parsed.score_source as "scored" | "estimated") ?? "scored",
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

  // Strip forwarded-email headers (delimiter-prefixed)
  text = text.replace(
    /-{3,}\s*Forwarded message\s*-{3,}\s*\n(?:From:.*\n|Date:.*\n|Subject:.*\n|To:.*\n)*/gi,
    "\n"
  );
  text = text.replace(
    /_{3,}\s*\n(?:From:.*\n|Sent:.*\n|To:.*\n|Subject:.*\n|Cc:.*\n)*/gi,
    "\n"
  );
  // Bare forwarded-header blocks ("From: X / Sent: Y / To: Z / Subject: W")
  text = text.replace(
    /(?:^|\n)(?:From|De):\s*[^\n]+\n(?:(?:Sent|Date|Envoy[ée]):\s*[^\n]+\n)?(?:(?:To|À|A):\s*[^\n]+\n)?(?:Cc:\s*[^\n]+\n)?(?:Subject|Objet):\s*[^\n]+\n/gi,
    "\n"
  );

  // Remove long URLs (tracking links, etc.)
  text = text.replace(/https?:\/\/\S{80,}/g, "[link]");

  // Collapse excessive whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * Returns true if the cleaned description looks like a real JD, false if
 * it's too short, mostly header residue, or missing JD signals. The UI
 * should hide the panel entirely when this returns false.
 */
function looksLikeRealJd(text: string): boolean {
  if (!text || text.length < 200) return false;
  const headerLines = (text.match(/(?:^|\n)(?:From|Sent|To|Subject|Date|Cc):\s/gi) ?? []).length;
  if (headerLines >= 3) return false;
  const jdSignals = [
    /responsibilit/i, /requirement/i, /qualificat/i, /experience/i,
    /duties/i, /what you['']ll (?:do|bring)/i, /we['']re looking for/i,
    /must have/i, /years? of/i, /bachelor|master|degree/i,
  ];
  return jdSignals.filter((p) => p.test(text)).length >= 2;
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
  onLeadUpdated?: (id: string, updates: Partial<PipelineLeadRow>) => void;
  onRefresh?: () => void | Promise<void>;
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
  onLeadUpdated,
  onRefresh,
}: LeadDetailSheetProps) {
  // Hooks must be called unconditionally — early return comes after
  const cleanedDescription = useMemo(
    () => (lead?.description_text ? cleanDescription(lead.description_text) : null),
    [lead?.description_text]
  );

  const [addingGap, setAddingGap] = useState<string | null>(null);
  const [addedGaps, setAddedGaps] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [markingDead, setMarkingDead] = useState(false);

  const hasRealJd = cleanedDescription ? looksLikeRealJd(cleanedDescription) : false;

  // When the panel is open with no real JD yet, watch for the Chrome extension
  // to capture one. Two paths: (1) visibilitychange/focus when the user returns
  // to the tab — fast but unreliable when both windows are side-by-side and
  // never lose visibility; (2) a 3s poll as a fallback so the JD always shows
  // up within a few seconds of capture regardless of window arrangement.
  useEffect(() => {
    if (!open || !lead || hasRealJd || !onRefresh) return;
    const handler = () => {
      if (document.visibilityState === "visible") void onRefresh();
    };
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    const interval = window.setInterval(() => {
      void onRefresh();
    }, 3000);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
      window.clearInterval(interval);
    };
  }, [open, lead, hasRealJd, onRefresh]);

  const handleManualRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleAddToProfile = useCallback(async (gapText: string) => {
    setAddingGap(gapText);
    try {
      // Fetch current profile
      const profileRes = await fetch("/api/profile");
      if (!profileRes.ok) throw new Error("Failed to load profile");
      const profile = await profileRes.json();

      const achievements = profile.achievements ?? [];

      // Add to "General" category, or create it
      const generalIdx = achievements.findIndex(
        (c: { category: string }) => c.category === "General"
      );
      const item = { text: gapText };

      if (generalIdx >= 0) {
        achievements[generalIdx].items.push(item);
      } else {
        achievements.push({ category: "General", items: [item] });
      }

      // Save
      const saveRes = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ achievements }),
      });

      if (!saveRes.ok) throw new Error("Failed to save profile");

      setAddedGaps((prev) => new Set(prev).add(gapText));
      toast.success("Added to profile — rescore to update match");
    } catch {
      toast.error("Failed to add to profile");
    } finally {
      setAddingGap(null);
    }
  }, []);

  // Opens the posting in a new tab so the Chrome extension can capture the JD
  // from the rendered DOM of a logged-in session. Server-side scraping is a
  // dead end for LinkedIn (sign-in wall) and violates the "JDs only from
  // extension DOM capture" rule. The visibilitychange listener above
  // auto-refreshes the lead when the user returns to this tab.
  const handleCaptureViaExtension = useCallback(() => {
    if (!lead?.career_page_url) return;
    window.open(lead.career_page_url, "_blank", "noopener,noreferrer");
    toast.info(
      "Opening posting — click 'Import Job' from the extension, then return here to refresh.",
      { duration: 8000 }
    );
  }, [lead?.career_page_url]);

  const handleMarkDead = useCallback(async () => {
    if (!lead) return;
    setMarkingDead(true);
    try {
      const res = await fetch("/api/pipeline/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lead.id,
          action: "skip",
          skip_reason: "Posting expired or removed (marked dead by user)",
        }),
      });
      if (res.ok) {
        toast.success("Marked as dead job");
        onLeadUpdated?.(lead.id, { status: "skipped" });
        onOpenChange(false);
      } else {
        toast.error("Failed to mark dead");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setMarkingDead(false);
  }, [lead, onLeadUpdated, onOpenChange]);

  if (!lead) return null;

  const scoreCfg = lead.score_overall
    ? SCORE_CONFIG[lead.score_overall as keyof typeof SCORE_CONFIG]
    : null;

  const details = parseScoreDetails(lead.score_details);

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
                {details?.score_source === "estimated"
                  ? " ~"
                  : lead.score_match_percentage != null
                    ? ` ${lead.score_match_percentage}%`
                    : ""}
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
              {details.score_source === "estimated" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800">
                  Estimated from role title — capture the full JD for an accurate score.
                </div>
              )}

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
                  <ul className="space-y-1.5">
                    {details.gaps.map((s, i) => (
                      <li key={i} className="text-sm text-red-900 flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5">
                          <span className="text-red-500 mt-0.5 shrink-0">&#10007;</span>
                          {s}
                        </div>
                        {addedGaps.has(s) ? (
                          <span className="text-xs text-green-600 shrink-0 mt-0.5">Added</span>
                        ) : (
                          <button
                            onClick={() => handleAddToProfile(s)}
                            disabled={addingGap === s}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline shrink-0 mt-0.5 flex items-center gap-0.5 disabled:opacity-50"
                          >
                            <Plus className="h-3 w-3" />
                            {addingGap === s ? "Adding..." : "I have this"}
                          </button>
                        )}
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
          {cleanedDescription && looksLikeRealJd(cleanedDescription) ? (
            <div>
              <h4 className="text-sm font-medium mb-2">Job Description</h4>
              <div className="rounded-lg border p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">
                {cleanedDescription}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <p className="text-sm font-medium text-amber-800">
                Not enough info to decide
              </p>
              <p className="text-xs text-amber-700">
                {cleanedDescription
                  ? "Only a summary was captured from the email digest. Open the posting and capture the full JD with the Chrome extension."
                  : "No job description was captured. Open the posting and capture the full JD with the Chrome extension."}
              </p>
              <div className="flex gap-2">
                {lead.career_page_url ? (
                  <Button size="sm" onClick={handleCaptureViaExtension}>
                    Capture via Extension
                  </Button>
                ) : null}
                <a
                  href={`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${lead.role} ${lead.company}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline">
                    Search LinkedIn
                  </Button>
                </a>
                {onRefresh && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleManualRefresh}
                    disabled={refreshing}
                    title="Reload this lead — use after capturing a JD with the extension"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </Button>
                )}
              </div>
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
              <Button
                variant="outline"
                onClick={handleMarkDead}
                disabled={markingDead}
                title="Posting is no longer available"
              >
                {markingDead ? "Marking..." : "Dead Job"}
              </Button>
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
