"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { STATUS_CONFIG, SCORE_CONFIG, APPLICATION_STATUSES } from "@/lib/constants";
import { downloadMarkdown, downloadDocx, downloadPdf } from "@/lib/document-export";
import type { ApplicationWithScores, MatchScoreRow, InterviewRound, StatusHistoryRow } from "@/types";
import { ReadyToApplyBanner } from "@/components/jobs/ready-to-apply-banner";
import { StatusTimeline } from "@/components/jobs/status-timeline";

const INTERVIEW_TYPES = [
  "recruiter_screen",
  "hiring_manager",
  "technical_panel",
  "behavioral",
  "system_design",
  "final",
] as const;

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  recruiter_screen: "Recruiter Screen",
  hiring_manager: "Hiring Manager",
  technical_panel: "Technical Panel",
  behavioral: "Behavioral",
  system_design: "System Design",
  final: "Final Round",
};

const INTERVIEW_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function ScoreTooltipBody({ score }: { score: MatchScoreRow }) {
  const counts = [
    ["Strong", score.strong_count],
    ["Partial", score.partial_count],
    ["Gaps", score.gap_count],
  ] as const;

  const topMatches = score.requirements_matched?.slice(0, 2) ?? [];
  const topGaps = [...(score.hard_gaps ?? []), ...(score.addressable_gaps ?? [])].slice(0, 2);

  return (
    <div className="space-y-2 py-1">
      <div>
        {counts.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 whitespace-nowrap">
            <span className="text-muted-foreground">{label}:</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>
      {topMatches.length > 0 && (
        <div className="flex flex-col">
          <span className="text-muted-foreground">Top Matches:</span>
          <span className="font-medium break-words">
            {topMatches.map((m) => m.requirement).join(", ")}
          </span>
        </div>
      )}
      {topGaps.length > 0 && (
        <div className="flex flex-col">
          <span className="text-muted-foreground">Top Gaps:</span>
          <span className="font-medium break-words">
            {topGaps.join(", ")}
          </span>
        </div>
      )}
      {score.red_flags?.length > 0 && (
        <div>
          <div className="font-medium text-destructive mb-0.5">Red flags:</div>
          <ul className="list-disc pl-3.5 space-y-0.5">
            {score.red_flags.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

function DownloadButtons({ content, company, role, docType }: {
  content: string;
  company: string;
  role: string;
  docType: "resume" | "cover-letter";
}) {
  const base = `${sanitizeFilename(company)}_${sanitizeFilename(role)}_${docType}`;
  return (
    <div className="flex gap-2 mt-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => downloadDocx(content, `${base}.docx`)}
      >
        .docx
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => downloadPdf(content, base)}
      >
        .pdf
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => downloadMarkdown(content, `${base}.md`)}
      >
        .md
      </Button>
    </div>
  );
}

function InterviewTimeline({
  interviews,
  onChange,
}: {
  interviews: InterviewRound[];
  onChange: (interviews: InterviewRound[]) => void;
}) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null);

  function addRound() {
    const nextRound = interviews.length > 0
      ? Math.max(...interviews.map((i) => i.round)) + 1
      : 1;
    onChange([
      ...interviews,
      {
        round: nextRound,
        type: "recruiter_screen",
        date: new Date().toISOString().split("T")[0],
        interviewer: "",
        status: "scheduled",
      },
    ]);
    setExpandedRound(nextRound);
  }

  function updateRound(round: number, updates: Partial<InterviewRound>) {
    onChange(
      interviews.map((i) =>
        i.round === round ? { ...i, ...updates } : i
      )
    );
  }

  function removeRound(round: number) {
    onChange(interviews.filter((i) => i.round !== round));
    if (expandedRound === round) setExpandedRound(null);
  }

  const sorted = [...interviews].sort((a, b) => a.round - b.round);

  return (
    <div className="space-y-3">
      {sorted.length === 0 && (
        <p className="text-sm text-muted-foreground">No interview rounds tracked yet.</p>
      )}
      {sorted.map((interview) => (
        <div
          key={interview.round}
          className="border rounded-lg p-3 space-y-2"
        >
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() =>
              setExpandedRound(
                expandedRound === interview.round ? null : interview.round
              )
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                R{interview.round}
              </span>
              <Badge
                variant="secondary"
                className={`text-xs ${INTERVIEW_STATUS_COLORS[interview.status] ?? ""}`}
              >
                {interview.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {INTERVIEW_TYPE_LABELS[interview.type] ?? interview.type}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {interview.date}
            </span>
          </div>

          {interview.interviewer && expandedRound !== interview.round && (
            <p className="text-xs text-muted-foreground pl-1">
              {interview.interviewer}
            </p>
          )}

          {expandedRound === interview.round && (
            <div className="space-y-3 pt-2 border-t">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Date</label>
                  <Input
                    type="date"
                    value={interview.date}
                    onChange={(e) =>
                      updateRound(interview.round, { date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Type</label>
                  <Select
                    value={interview.type}
                    onValueChange={(v) =>
                      updateRound(interview.round, { type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVIEW_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {INTERVIEW_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Interviewer(s)</label>
                <Input
                  placeholder="Name, Title"
                  value={interview.interviewer}
                  onChange={(e) =>
                    updateRound(interview.round, { interviewer: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Duration</label>
                  <Input
                    placeholder="30 min"
                    value={interview.duration ?? ""}
                    onChange={(e) =>
                      updateRound(interview.round, {
                        duration: e.target.value || undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Status</label>
                  <Select
                    value={interview.status}
                    onValueChange={(v) =>
                      updateRound(interview.round, {
                        status: v as InterviewRound["status"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Focus / Topics</label>
                <Input
                  placeholder="System design, behavioral, etc."
                  value={interview.focus ?? ""}
                  onChange={(e) =>
                    updateRound(interview.round, {
                      focus: e.target.value || undefined,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium">Outcome / Notes</label>
                <Textarea
                  rows={2}
                  placeholder="How did it go? Key signals..."
                  value={interview.outcome ?? ""}
                  onChange={(e) =>
                    updateRound(interview.round, {
                      outcome: e.target.value || undefined,
                    })
                  }
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => removeRound(interview.round)}
              >
                Remove Round
              </Button>
            </div>
          )}
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addRound}>
        + Add Round
      </Button>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const promoted = searchParams.get("promoted") === "true";
  const [app, setApp] = useState<ApplicationWithScores | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingJd, setEditingJd] = useState(false);
  const [applying, setApplying] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [generatingCL, setGeneratingCL] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [tailoredResume, setTailoredResume] = useState<string | null>(null);
  const [tailorMatchPct, setTailorMatchPct] = useState<number | null>(null);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryRow[]>([]);

  useEffect(() => {
    fetch(`/api/applications/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setApp(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch(`/api/applications/${params.id}/history`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setStatusHistory(data);
      })
      .catch(() => {});
  }, [params.id]);

  async function handleSave() {
    if (!app) return;
    setSaving(true);
    const res = await fetch(`/api/applications/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: app.status,
        notes: app.notes,
        contact: app.contact,
        follow_up_date: app.follow_up_date,
        interview_date: app.interview_date,
        interview_type: app.interview_type,
        interview_notes: app.interview_notes,
        interviews: app.interviews ?? [],
        resources: app.resources ?? [],
        rejection_date: app.rejection_date,
        rejection_reason: app.rejection_reason,
        rejection_insights: app.rejection_insights,
        job_description: app.job_description,
      }),
    });
    if (res.ok) {
      toast.success("Application updated");
    } else {
      toast.error("Failed to update");
    }
    setSaving(false);
  }

  async function handleTailorResume() {
    if (!app) return;
    setTailoring(true);
    try {
      const res = await fetch("/api/tailor-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: app.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setTailoredResume(data.resume);
        setTailorMatchPct(data.match_percentage);
        const pctLabel = data.match_percentage ? ` — ${data.match_percentage}% match` : "";
        toast.success(`Resume tailored${pctLabel}`);
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to tailor resume");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setTailoring(false);
  }

  async function handleGenerateCoverLetter() {
    if (!app) return;
    setGeneratingCL(true);
    try {
      const res = await fetch("/api/generate-cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: app.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setCoverLetter(data.cover_letter);
        toast.success("Cover letter generated");
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to generate cover letter");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setGeneratingCL(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this application?")) return;
    await fetch(`/api/applications/${params.id}`, { method: "DELETE" });
    toast.success("Application deleted");
    router.push("/dashboard/tracker");
  }

  async function handleScore() {
    if (!app) return;
    setScoring(true);
    try {
      const res = await fetch(`/api/applications/${params.id}/score`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setApp({
          ...app,
          match_scores: [data],
        });
        toast.success(`Scored: ${data.overall} — ${data.match_percentage}%`);
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to score");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setScoring(false);
  }

  async function handleMarkApplied() {
    if (!app) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/applications/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setApp({ ...app, ...updated });
        toast.success("Marked as Applied — follow-up set for 7 days");
      } else {
        toast.error("Failed to update");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setApplying(false);
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>;
  if (!app) return <div className="text-muted-foreground">Not found.</div>;

  const score = Array.isArray(app.match_scores)
    ? app.match_scores[0]
    : app.match_scores;
  const scoreCfg = score?.overall
    ? SCORE_CONFIG[score.overall as keyof typeof SCORE_CONFIG]
    : null;
  const statusCfg = STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG];

  const appMatchPct = score?.match_percentage
    ?? (score ? (() => {
        const s = score.strong_count ?? 0;
        const p = score.partial_count ?? 0;
        const total = s + p + (score.gap_count ?? 0);
        return total > 0 ? Math.round(((s + p * 0.5) / total) * 1000) / 10 : null;
      })()
    : null);
  const displayMatchPct = tailorMatchPct ?? appMatchPct;

  const resumeContent = tailoredResume ?? app.tailored_resume ?? app.resume_version;
  const clContent = coverLetter ?? app.cover_letter;

  const interviews: InterviewRound[] = app.interviews ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{app.company}</h2>
          <p className="text-lg text-muted-foreground">{app.role}</p>
        </div>
        <div className="flex gap-2 items-center">
          {scoreCfg && score && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex cursor-help rounded-full px-3 py-1 text-sm font-medium ${scoreCfg.color}`}
                >
                  {scoreCfg.label}
                  {displayMatchPct != null && ` ${displayMatchPct}%`}
                </span>
              </TooltipTrigger>
              <TooltipContent className="min-w-[200px] max-w-sm text-left" side="bottom">
                <ScoreTooltipBody score={score} />
              </TooltipContent>
            </Tooltip>
          )}
          <Badge variant={statusCfg?.variant ?? "secondary"} className="text-sm">
            {statusCfg?.label ?? app.status}
          </Badge>
        </div>
      </div>

      {/* Ready to Apply banner — shown for pre-apply statuses or fresh promotion */}
      {(promoted || ["pending_review", "evaluating", "ready_to_apply"].includes(app.status)) && (
        <ReadyToApplyBanner
          app={app}
          score={score ?? null}
          onTailorResume={handleTailorResume}
          onGenerateCoverLetter={handleGenerateCoverLetter}
          onScore={handleScore}
          onMarkApplied={handleMarkApplied}
          tailoring={tailoring}
          generatingCL={generatingCL}
          scoring={scoring}
          applying={applying}
        />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select
                value={app.status}
                onValueChange={(v) => {
                  const updates: Partial<ApplicationWithScores> = { status: v };
                  if (v === "rejected" && !app.rejection_date) {
                    updates.rejection_date = new Date().toISOString().split("T")[0];
                  }
                  setApp({ ...app, ...updates });
                  if (v === "rejected") {
                    setTimeout(() => {
                      document.getElementById("rejection-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 100);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLICATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_CONFIG[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Contact</label>
              <Input
                value={app.contact}
                onChange={(e) => setApp({ ...app, contact: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Follow-up Date</label>
              <Input
                type="date"
                value={app.follow_up_date ?? ""}
                onChange={(e) =>
                  setApp({ ...app, follow_up_date: e.target.value || null })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                rows={4}
                value={app.notes}
                onChange={(e) => setApp({ ...app, notes: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                Interviews
                {interviews.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({interviews.filter((i) => i.status === "completed").length}/{interviews.length} completed)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <InterviewTimeline
                interviews={interviews}
                onChange={(updated) =>
                  setApp({ ...app, interviews: updated })
                }
              />
            </CardContent>
          </Card>

          {statusHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusTimeline history={statusHistory} />
              </CardContent>
            </Card>
          )}

          <Card id="rejection-card">
            <CardHeader>
              <CardTitle>Rejection / Outcome</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Rejection Date</label>
                <Input
                  type="date"
                  value={app.rejection_date ?? ""}
                  onChange={(e) =>
                    setApp({ ...app, rejection_date: e.target.value || null })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Reason</label>
                <Input
                  value={app.rejection_reason ?? ""}
                  onChange={(e) =>
                    setApp({ ...app, rejection_reason: e.target.value || null })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Insights</label>
                <Textarea
                  rows={3}
                  placeholder="What did you learn from this?"
                  value={app.rejection_insights ?? ""}
                  onChange={(e) =>
                    setApp({
                      ...app,
                      rejection_insights: e.target.value || null,
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Job Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Job Description
            {app.job_description && !editingJd && (
              <Button variant="ghost" size="sm" onClick={() => setEditingJd(true)}>
                Edit
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!app.job_description || editingJd ? (
            <div className="space-y-2">
              <Textarea
                value={app.job_description ?? ""}
                onChange={(e) => setApp({ ...app, job_description: e.target.value })}
                placeholder="Paste the full job description here..."
                className="min-h-[200px] max-h-[60vh] resize-y text-sm"
                rows={10}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {app.job_description ? `${app.job_description.length.toLocaleString()} characters` : "Required for scoring and resume tailoring"}
                </p>
                {editingJd && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingJd(false)}>
                    Done
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <pre className="text-sm bg-muted p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
              {app.job_description}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={handleScore}
              disabled={scoring || !app.job_description}
              variant="outline"
            >
              {scoring ? "Scoring..." : scoreCfg ? "Re-Score" : "Score"}
            </Button>
            <Button
              onClick={handleTailorResume}
              disabled={tailoring}
              variant="outline"
            >
              {tailoring ? "Tailoring..." : "Tailor Resume"}
            </Button>
            <Button
              onClick={handleGenerateCoverLetter}
              disabled={generatingCL}
              variant="outline"
            >
              {generatingCL ? "Generating..." : "Generate Cover Letter"}
            </Button>
          </div>

          {resumeContent && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-medium">
                  {tailoredResume ? "Tailored Resume" : "Saved Resume"}
                </h4>
                {displayMatchPct != null && score && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`inline-flex cursor-help rounded-full px-2 py-0.5 text-xs font-medium ${
                        displayMatchPct >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                        displayMatchPct >= 60 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                        "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}>
                        {displayMatchPct}% match
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="min-w-[200px] max-w-sm text-left" side="bottom">
                      <ScoreTooltipBody score={score} />
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
                {resumeContent}
              </pre>
              <DownloadButtons
                content={resumeContent}
                company={app.company}
                role={app.role}
                docType="resume"
              />
            </div>
          )}

          {clContent && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                {coverLetter ? "Cover Letter" : "Saved Cover Letter"}
              </h4>
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
                {clContent}
              </pre>
              <DownloadButtons
                content={clContent}
                company={app.company}
                role={app.role}
                docType="cover-letter"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        <Button variant="destructive" onClick={handleDelete}>
          Delete Application
        </Button>
      </div>
    </div>
  );
}
