"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import type { ApplicationWithScores, MatchScoreRow } from "@/types";

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

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [app, setApp] = useState<ApplicationWithScores | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [generatingCL, setGeneratingCL] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [tailoredResume, setTailoredResume] = useState<string | null>(null);
  const [tailorMatchPct, setTailorMatchPct] = useState<number | null>(null);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setApp(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
        rejection_date: app.rejection_date,
        rejection_reason: app.rejection_reason,
        rejection_insights: app.rejection_insights,
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

  if (loading) return <div className="text-muted-foreground">Loading...</div>;
  if (!app) return <div className="text-muted-foreground">Not found.</div>;

  const score = Array.isArray(app.match_scores)
    ? app.match_scores[0]
    : app.match_scores;
  const scoreCfg = score?.overall
    ? SCORE_CONFIG[score.overall as keyof typeof SCORE_CONFIG]
    : null;
  const statusCfg = STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG];

  // Compute match percentage: prefer API response, fall back to app data
  const appMatchPct = score?.match_percentage
    ?? (score ? (() => {
        const s = score.strong_count ?? 0;
        const p = score.partial_count ?? 0;
        const total = s + p + (score.gap_count ?? 0);
        return total > 0 ? Math.round(((s + p * 0.5) / total) * 1000) / 10 : null;
      })()
    : null);
  const displayMatchPct = tailorMatchPct ?? appMatchPct;

  // Determine which content to show for resume and cover letter
  const resumeContent = tailoredResume ?? app.tailored_resume;
  const clContent = coverLetter ?? app.cover_letter;

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
                onValueChange={(v) => setApp({ ...app, status: v })}
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
              <CardTitle>Interview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Interview Date</label>
                <Input
                  type="date"
                  value={app.interview_date ?? ""}
                  onChange={(e) =>
                    setApp({ ...app, interview_date: e.target.value || null })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Type</label>
                <Input
                  placeholder="phone, video, onsite..."
                  value={app.interview_type ?? ""}
                  onChange={(e) =>
                    setApp({ ...app, interview_type: e.target.value || null })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <Textarea
                  rows={3}
                  value={app.interview_notes ?? ""}
                  onChange={(e) =>
                    setApp({ ...app, interview_notes: e.target.value || null })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
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
      {app.job_description && (
        <Card>
          <CardHeader>
            <CardTitle>Job Description</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm bg-muted p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
              {app.job_description}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* AI generation buttons */}
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

          {/* Tailored Resume */}
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

          {/* Cover Letter */}
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
