"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SCORE_CONFIG } from "@/lib/constants";

interface ScoreResult {
  score: {
    overall: string;
    match_percentage: number;
    strong_count: number;
    partial_count: number;
    gap_count: number;
  };
  ai_analysis: {
    summary: string;
    recommended_action: string;
    addressable_gaps: string[];
    hard_gaps: string[];
  } | null;
  red_flags: string[];
}

interface QuickScoreDialogProps {
  onSaved?: () => void;
  trigger?: React.ReactNode;
}

export function QuickScoreDialog({ onSaved, trigger }: QuickScoreDialogProps) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [savedAppId, setSavedAppId] = useState<string | null>(null);

  function reset() {
    setCompany("");
    setRole("");
    setJobDescription("");
    setResult(null);
    setSavedAppId(null);
  }

  // Creates application first, then analyzes by ID (metered as 1 application)
  async function handleAnalyze() {
    if (!company || !role || !jobDescription) {
      toast.error("Please fill in all fields");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      // Step 1: Create application
      const createRes = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          role,
          job_description: jobDescription,
          status: "evaluating",
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => null);
        toast.error(err?.error ?? "Failed to create application");
        return;
      }
      const created = await createRes.json();
      setSavedAppId(created.id);

      // Step 2: Analyze by application_id
      const res = await fetch("/api/analyze-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: created.id }),
      });
      if (res.status === 429) {
        toast.error("Application quota exceeded. Upgrade your plan or buy more applications.");
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Analysis failed");
        return;
      }
      const data = await res.json();
      setResult(data);

      // Auto-score in background
      fetch(`/api/applications/${created.id}/score`, {
        method: "POST",
      }).catch(() => {});
    } catch {
      toast.error("Something went wrong");
    } finally {
      setAnalyzing(false);
    }
  }

  const scoreCfg = result?.score?.overall
    ? SCORE_CONFIG[result.score.overall as keyof typeof SCORE_CONFIG]
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">Quick Score</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Score</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Company</label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Google"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. VP of Engineering"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Job Description</label>
            <Textarea
              rows={8}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here..."
              className="mt-1 max-h-[40vh] resize-y"
            />
          </div>
          <Button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="w-full"
          >
            {analyzing ? "Analyzing..." : "Score"}
          </Button>
        </div>

        {result && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Result</span>
              {scoreCfg && (
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${scoreCfg.color}`}
                >
                  {scoreCfg.label} — {result.score.match_percentage}%
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <div className="text-lg font-bold text-green-600">
                  {result.score.strong_count}
                </div>
                <div className="text-muted-foreground">Strong</div>
              </div>
              <div>
                <div className="text-lg font-bold text-yellow-600">
                  {result.score.partial_count}
                </div>
                <div className="text-muted-foreground">Partial</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-600">
                  {result.score.gap_count}
                </div>
                <div className="text-muted-foreground">Gaps</div>
              </div>
            </div>
            {result.ai_analysis && (
              <div className="text-sm space-y-1">
                <p className="text-muted-foreground">
                  {result.ai_analysis.summary}
                </p>
                <Badge
                  variant={
                    result.ai_analysis.recommended_action === "apply"
                      ? "default"
                      : result.ai_analysis.recommended_action === "consider"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {result.ai_analysis.recommended_action === "apply"
                    ? "Recommended: Apply"
                    : result.ai_analysis.recommended_action === "consider"
                      ? "Worth Considering"
                      : "Recommend Skip"}
                </Badge>
              </div>
            )}
            {result.red_flags?.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {result.red_flags.map((f, i) => (
                  <Badge key={i} variant="destructive" className="text-xs">
                    {f}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              onClick={() => {
                toast.success("Saved to Jobs");
                setOpen(false);
                reset();
                onSaved?.();
              }}
              variant="outline"
              className="w-full"
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
