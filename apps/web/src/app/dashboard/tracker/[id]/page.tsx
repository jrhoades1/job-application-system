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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { STATUS_CONFIG, SCORE_CONFIG, APPLICATION_STATUSES } from "@/lib/constants";
import { downloadMarkdown, downloadDocx, downloadPdf } from "@/lib/document-export";
import type { ApplicationWithScores, MatchScoreRow, InterviewRound, StatusHistoryRow } from "@/types";
import { ReadyToApplyBanner } from "@/components/jobs/ready-to-apply-banner";
import { StatusTimeline } from "@/components/jobs/status-timeline";
import { FollowUpActionPanel } from "@/components/jobs/followup-action-panel";

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
  const actionType = searchParams.get("action");
  const actionDetail = searchParams.get("detail") ?? "";
  const [app, setApp] = useState<ApplicationWithScores | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingJd, setEditingJd] = useState(false);
  const [applying, setApplying] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [generatingCL, setGeneratingCL] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{ used: number; total: number; plan: string } | null>(null);
  const [tailoredResume, setTailoredResume] = useState<string | null>(null);
  const [tailorMatchPct, setTailorMatchPct] = useState<number | null>(null);
  const [resumeMatchPct, setResumeMatchPct] = useState<number | null>(null);
  const [resumeGaps, setResumeGaps] = useState<string[]>([]);
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [atsMissing, setAtsMissing] = useState<string[]>([]);
  const [atsKeywords, setAtsKeywords] = useState<{ keyword: string; found: boolean; category: string }[]>([]);
  const [addKeywordOpen, setAddKeywordOpen] = useState(false);
  const [addKeywordTarget, setAddKeywordTarget] = useState<string | null>(null);
  const [addKeywordText, setAddKeywordText] = useState("");
  const [addingKeyword, setAddingKeyword] = useState(false);
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
    fetch("/api/subscription")
      .then((r) => r.json())
      .then((data) => {
        setQuotaInfo({
          used: data.applications_used ?? 0,
          total: data.total_available ?? 3,
          plan: data.plan_type ?? "free",
        });
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
        ...(app.job_description ? { job_description: app.job_description } : {}),
      }),
    });
    if (res.ok) {
      toast.success("Application updated");
      // Navigate back to where the user came from (list view)
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/dashboard/jobs");
      }
      return;
    } else {
      const err = await res.json().catch(() => null);
      const detail = err?.details?.fieldErrors
        ? Object.entries(err.details.fieldErrors)
            .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
            .join("; ")
        : err?.error ?? "Unknown error";
      toast.error(`Failed to update: ${detail}`);
      console.error("Update failed:", err);
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
        setResumeMatchPct(data.resume_match_percentage ?? null);
        setResumeGaps(data.resume_gaps ?? []);
        setAtsScore(data.ats_score ?? null);
        setAtsMissing(data.ats_missing ?? []);
        setAtsKeywords(data.ats_keywords ?? []);
        if (quotaInfo) setQuotaInfo({ ...quotaInfo, used: quotaInfo.used + 1 });
        const atsLabel = data.ats_score != null ? ` | ATS ${data.ats_score}%` : "";
        const resumePctLabel = data.resume_match_percentage ? ` - Resume ${data.resume_match_percentage}% match${atsLabel}` : "";
        toast.success(`Resume tailored${resumePctLabel}`);
      } else if (res.status === 429) {
        toast.error("Application quota exceeded. Upgrade your plan or buy more applications.");
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to tailor resume");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setTailoring(false);
  }

  function getKeywordExample(keyword: string): string {
    const kw = keyword.toLowerCase();
    const role = app?.role ?? "this role";
    // Generate contextual examples based on keyword category
    const examples: Record<string, string> = {
      python: `Used Python to build data pipelines and automate ML model training workflows, reducing processing time by 40%.`,
      java: `Developed enterprise Java applications for healthcare claims processing, handling 10K+ transactions daily.`,
      sql: `Wrote complex SQL queries for reporting dashboards, optimizing query performance across 50M+ row tables.`,
      tensorflow: `Built and deployed TensorFlow models for predictive patient risk scoring in production environments.`,
      pytorch: `Trained PyTorch neural networks for NLP classification tasks, achieving 92% accuracy on clinical text.`,
      "scikit-learn": `Applied scikit-learn for feature engineering and model selection in healthcare analytics pipelines.`,
      keras: `Prototyped deep learning models with Keras for rapid experimentation before production deployment.`,
      aws: `Architected AWS cloud infrastructure (EC2, S3, Lambda, RDS) supporting 99.9% uptime for healthcare platforms.`,
      azure: `Migrated on-premise systems to Azure, leveraging App Services and Azure SQL for scalable cloud deployment.`,
      "google cloud": `Leveraged Google Cloud Platform for data analytics workloads and BigQuery-based reporting.`,
      kubernetes: `Orchestrated containerized microservices with Kubernetes, managing 20+ services in production.`,
      docker: `Containerized applications with Docker for consistent development, testing, and production environments.`,
      sagemaker: `Deployed ML models to production using AWS SageMaker endpoints with auto-scaling inference.`,
      "azure machine learning": `Built and managed ML pipelines using Azure Machine Learning for automated model retraining.`,
      jupyter: `Used Jupyter Notebooks for exploratory data analysis, model prototyping, and stakeholder presentations.`,
      "apache spark": `Processed large-scale datasets using Apache Spark for ETL pipelines and feature engineering.`,
      hadoop: `Managed Hadoop clusters for distributed data processing across terabyte-scale healthcare datasets.`,
      "data governance": `Established data governance frameworks ensuring data quality, lineage tracking, and regulatory compliance.`,
      "data warehousing": `Designed data warehouse architectures for centralized reporting across multiple business units.`,
      "data lake": `Built data lake infrastructure on S3/Azure Data Lake for unified storage of structured and unstructured data.`,
      "machine learning": `Applied machine learning techniques to optimize healthcare operations, from patient scheduling to risk prediction.`,
      "deep learning": `Implemented deep learning solutions for image classification and NLP tasks in healthcare applications.`,
      nlp: `Built NLP pipelines for clinical text extraction, automating medical record analysis and coding.`,
      "change management": `Led change management initiatives during technology transformations, achieving 90%+ adoption rates.`,
      "stakeholder management": `Managed stakeholder relationships across engineering, product, and executive teams to align on technical roadmaps.`,
      roadmap: `Developed multi-quarter technology roadmaps aligned with business objectives and growth targets.`,
      "cross-functional": `Led cross-functional teams spanning engineering, product, design, and operations.`,
      kpi: `Defined and monitored KPIs for engineering velocity, system reliability, and business impact.`,
      hipaa: `Ensured HIPAA compliance across all healthcare platforms, passing annual security audits without findings.`,
      "soc 2": `Led SOC 2 Type II certification process, establishing controls and audit preparation procedures.`,
      agile: `Implemented Agile/Scrum methodologies across engineering teams, improving sprint velocity by 25%.`,
      "ci/cd": `Built CI/CD pipelines using GitHub Actions and Jenkins, reducing deployment time from days to hours.`,
      devops: `Established DevOps practices including automated testing, infrastructure-as-code, and monitoring.`,
      microservices: `Transformed monolithic applications into microservices architecture, improving scalability and deployment independence.`,
    };
    return examples[kw] ?? `Applied ${keyword} in the context of ${role}, contributing to improved outcomes and efficiency.`;
  }

  function openAddKeyword(keyword: string) {
    setAddKeywordTarget(keyword);
    setAddKeywordText("");
    setAddKeywordOpen(true);
  }

  async function handleAddKeyword() {
    if (!addKeywordTarget || !addKeywordText.trim()) return;
    setAddingKeyword(true);
    try {
      const res = await fetch("/api/profile/add-achievement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "Technical Skills",
          text: addKeywordText.trim(),
        }),
      });
      if (res.ok) {
        // Mark keyword as found in local state
        setAtsKeywords((prev) =>
          prev.map((k) =>
            k.keyword.toLowerCase() === addKeywordTarget.toLowerCase()
              ? { ...k, found: true }
              : k
          )
        );
        setAtsMissing((prev) =>
          prev.filter((k) => k.toLowerCase() !== addKeywordTarget!.toLowerCase())
        );
        // Recalculate ATS score
        setAtsScore((prev) => {
          if (prev == null) return prev;
          const total = atsKeywords.length || displayAtsKeywords.length;
          const newFound = (displayAtsKeywords.filter((k) => k.found).length) + 1;
          return total > 0 ? Math.round((newFound / total) * 1000) / 10 : prev;
        });
        toast.success(`Added "${addKeywordTarget}" to your profile. Re-tailor your resume to include it.`, {
          duration: 6000,
          action: {
            label: "Re-Tailor Now",
            onClick: () => handleTailorResume(),
          },
        });
        setAddKeywordOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to add");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setAddingKeyword(false);
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
        if (quotaInfo) setQuotaInfo({ ...quotaInfo, used: quotaInfo.used + 1 });
        toast.success("Cover letter generated");
      } else if (res.status === 429) {
        toast.error("Application quota exceeded. Upgrade your plan or buy more applications.");
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

  // Job Score: achievement-based (shown in header)
  const jobMatchPct = score?.match_percentage
    ?? (score ? (() => {
        const s = score.strong_count ?? 0;
        const p = score.partial_count ?? 0;
        const total = s + p + (score.gap_count ?? 0);
        return total > 0 ? Math.round(((s + p * 0.5) / total) * 1000) / 10 : null;
      })()
    : null);

  // Resume Match: tailored resume text vs JD (shown on resume section)
  const displayResumeMatchPct = resumeMatchPct ?? score?.resume_match_percentage ?? null;
  const displayResumeGaps = resumeGaps.length > 0 ? resumeGaps : (score?.resume_gaps ?? []);

  // ATS Score: literal keyword matching (pre-submit gate)
  const displayAtsKeywords = atsKeywords.length > 0 ? atsKeywords : (score?.ats_keywords ?? []);
  // Derive missing from keywords so tooltip stays in sync after interactive adds
  const displayAtsMissing = displayAtsKeywords.filter((k) => !k.found).map((k) => k.keyword);
  const displayAtsScore = atsScore ?? score?.ats_score ?? null;

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
                  Job Score
                  {jobMatchPct != null && ` ${jobMatchPct}%`}
                </span>
              </TooltipTrigger>
              <TooltipContent className="min-w-[200px] max-w-sm text-left" side="bottom">
                <ScoreTooltipBody score={score} />
              </TooltipContent>
            </Tooltip>
          )}
          {displayResumeMatchPct != null && (
            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
              displayResumeMatchPct >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
              displayResumeMatchPct >= 60 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
              "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
            }`}>
              Resume {displayResumeMatchPct}%
            </span>
          )}
          {displayAtsScore != null && (
            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
              displayAtsScore >= 90 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" :
              displayAtsScore >= 70 ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" :
              "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
            }`}>
              ATS {displayAtsScore}%
            </span>
          )}
          <Badge variant={statusCfg?.variant ?? "secondary"} className="text-sm">
            {statusCfg?.label ?? app.status}
          </Badge>
        </div>
      </div>

      {/* Follow-up action panel — shown when arriving from Today dashboard */}
      {actionType && (
        <FollowUpActionPanel
          actionType={actionType as Parameters<typeof FollowUpActionPanel>[0]["actionType"]}
          detail={actionDetail}
          applicationId={app.id}
          company={app.company}
          followUpDate={app.follow_up_date}
          contact={app.contact}
          onFollowUpDateChanged={(date) => setApp({ ...app, follow_up_date: date })}
        />
      )}

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
              disabled={tailoring || (quotaInfo ? quotaInfo.used >= quotaInfo.total : false)}
              variant="outline"
            >
              {tailoring ? "Tailoring..." : "Tailor Resume"}
            </Button>
            <Button
              onClick={handleGenerateCoverLetter}
              disabled={generatingCL || (quotaInfo ? quotaInfo.used >= quotaInfo.total : false)}
              variant="outline"
            >
              {generatingCL ? "Generating..." : "Generate Cover Letter"}
            </Button>
            {quotaInfo && (
              <span className="text-xs text-muted-foreground self-center">
                {quotaInfo.used}/{quotaInfo.total} applications used
                {quotaInfo.used >= quotaInfo.total && (
                  <a href="/dashboard/settings?tab=billing" className="text-primary ml-1 underline">
                    Upgrade
                  </a>
                )}
              </span>
            )}
          </div>

          {resumeContent && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-medium">
                  {tailoredResume ? "Tailored Resume" : "Saved Resume"}
                </h4>
                {displayResumeMatchPct != null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`inline-flex cursor-help rounded-full px-2 py-0.5 text-xs font-medium ${
                        displayResumeMatchPct >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                        displayResumeMatchPct >= 60 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                        "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}>
                        Resume {displayResumeMatchPct}% match
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="min-w-[260px] max-w-sm text-left" side="bottom">
                      <p className="font-medium mb-1">Resume vs Job Description</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        How well the tailored resume covers JD requirements
                      </p>
                      {displayResumeGaps.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-red-500 mb-1">Missing from resume:</p>
                          <ul className="text-xs space-y-0.5">
                            {displayResumeGaps.map((g, i) => (
                              <li key={i} className="text-muted-foreground">- {g}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {displayResumeGaps.length === 0 && (
                        <p className="text-xs text-green-600">All JD requirements covered!</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
                {jobMatchPct != null && score && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`inline-flex cursor-help rounded-full px-2 py-0.5 text-xs font-medium ${
                        jobMatchPct >= 80 ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                        jobMatchPct >= 60 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                        "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}>
                        You {jobMatchPct}% match
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="min-w-[200px] max-w-sm text-left" side="bottom">
                      <ScoreTooltipBody score={score} />
                    </TooltipContent>
                  </Tooltip>
                )}
                {displayAtsScore != null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`inline-flex cursor-help rounded-full px-2 py-0.5 text-xs font-medium ${
                        displayAtsScore >= 90 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" :
                        displayAtsScore >= 70 ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" :
                        "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}>
                        ATS {displayAtsScore}%
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="min-w-[280px] max-w-md text-left" side="bottom">
                      <p className="font-medium mb-1">ATS Keyword Match</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        Literal keyword matching — what an ATS scanner sees
                      </p>
                      {displayAtsMissing.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-red-500 mb-1">
                            Missing keywords ({displayAtsMissing.length}):
                          </p>
                          <div className="text-xs space-y-0.5 mb-2">
                            {displayAtsMissing.map((k, i) => (
                              <span key={i} className="inline-block bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded px-1.5 py-0.5 mr-1 mb-0.5">
                                {k}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                      {displayAtsMissing.length === 0 && (
                        <p className="text-xs text-green-600">All JD keywords found in resume!</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* ATS Readiness Checklist */}
              {displayAtsKeywords.length > 0 && (
                <div className="mb-3 p-3 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-xs font-medium">ATS Readiness: {displayAtsKeywords.filter(k => k.found).length}/{displayAtsKeywords.length} keywords</h5>
                    {displayAtsScore != null && (
                      <span className={`text-xs font-medium ${
                        displayAtsScore >= 90 ? "text-emerald-600" :
                        displayAtsScore >= 70 ? "text-amber-600" : "text-red-600"
                      }`}>
                        {displayAtsScore >= 90 ? "Ready to submit" :
                         displayAtsScore >= 70 ? "Review missing keywords" : "Add missing keywords before submitting"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {displayAtsKeywords.map((k, i) => (
                      k.found ? (
                        <span
                          key={i}
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                        >
                          {"\u2713"} {k.keyword}
                        </span>
                      ) : (
                        <button
                          key={i}
                          onClick={() => openAddKeyword(k.keyword)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 font-medium hover:bg-red-100 dark:hover:bg-red-900 transition-colors cursor-pointer"
                        >
                          {"\u2717"} {k.keyword} <span className="text-red-400 ml-0.5">+</span>
                        </button>
                      )
                    ))}
                  </div>
                </div>
              )}

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

      {/* Add Missing Keyword Dialog */}
      <Dialog open={addKeywordOpen} onOpenChange={setAddKeywordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add &quot;{addKeywordTarget}&quot; to your profile</DialogTitle>
            <DialogDescription>
              Briefly describe how you&apos;ve used {addKeywordTarget}. This will be added to your
              achievements so future resumes include it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Example:</p>
              <p className="text-xs bg-muted p-2 rounded italic">
                {addKeywordTarget ? getKeywordExample(addKeywordTarget) : ""}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Your experience with {addKeywordTarget}:</p>
              <Textarea
                placeholder={`Describe how you've used ${addKeywordTarget ?? "this skill"}...`}
                value={addKeywordText}
                onChange={(e) => setAddKeywordText(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddKeywordOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddKeyword} disabled={addingKeyword || !addKeywordText.trim()}>
              {addingKeyword ? "Adding..." : "Add to Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
