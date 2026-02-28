"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { SCORE_CONFIG } from "@/lib/constants";

interface AnalysisResult {
  score: {
    overall: string;
    match_percentage: number;
    strong_count: number;
    partial_count: number;
    gap_count: number;
  };
  matches: {
    requirement: string;
    match_type: "strong" | "partial" | "gap";
    evidence: string;
    category: string;
  }[];
  keywords: string[];
  red_flags: string[];
  employment_type: string;
  location: { match: boolean; location: string; remote_status: string };
  ai_analysis: {
    summary: string;
    addressable_gaps: string[];
    hard_gaps: string[];
    strategic_notes: string;
    recommended_action: string;
    tailoring_intensity: string;
  } | null;
}

export default function AnalyzePage() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function handleAnalyze() {
    if (!company || !role || !jobDescription) {
      toast.error("Please fill in all fields");
      return;
    }

    setAnalyzing(true);
    setResult(null);

    try {
      const res = await fetch("/api/analyze-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          role,
          job_description: jobDescription,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Analysis failed");
        return;
      }

      const data = await res.json();
      setResult(data);
      toast.success("Analysis complete");
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
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold">Analyze Job</h2>

      <Card>
        <CardHeader>
          <CardTitle>Paste a Job Posting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Company</label>
              <Input
                placeholder="e.g. Google"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Input
                placeholder="e.g. VP of Engineering"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Job Description</label>
            <Textarea
              rows={12}
              placeholder="Paste the full job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? "Analyzing..." : "Analyze Job"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Match Score</CardTitle>
                {scoreCfg && (
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${scoreCfg.color}`}
                  >
                    {scoreCfg.label} — {result.score.match_percentage}%
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {result.score.strong_count}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Strong Matches
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {result.score.partial_count}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Partial Matches
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {result.score.gap_count}
                  </div>
                  <div className="text-sm text-muted-foreground">Gaps</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {result.ai_analysis && (
            <Card>
              <CardHeader>
                <CardTitle>AI Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>{result.ai_analysis.summary}</p>

                <div className="flex gap-2">
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
                  <Badge variant="outline">
                    Tailoring: {result.ai_analysis.tailoring_intensity}
                  </Badge>
                </div>

                {result.ai_analysis.addressable_gaps.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Addressable Gaps</h4>
                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                      {result.ai_analysis.addressable_gaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.ai_analysis.hard_gaps.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Hard Gaps</h4>
                    <ul className="list-disc list-inside text-sm text-red-600">
                      {result.ai_analysis.hard_gaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.ai_analysis.strategic_notes && (
                  <div>
                    <h4 className="font-medium mb-1">Strategic Notes</h4>
                    <p className="text-sm text-muted-foreground">
                      {result.ai_analysis.strategic_notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Requirements Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {result.matches.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-2 border-b last:border-0"
                  >
                    <Badge
                      variant={
                        m.match_type === "strong"
                          ? "default"
                          : m.match_type === "partial"
                            ? "secondary"
                            : "destructive"
                      }
                      className="mt-0.5 shrink-0"
                    >
                      {m.match_type}
                    </Badge>
                    <div>
                      <p className="text-sm">{m.requirement}</p>
                      {m.evidence && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Evidence: {m.evidence}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {result.keywords.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Keywords Found</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {result.keywords.map((kw, i) => (
                      <Badge key={i} variant="outline">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.red_flags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Red Flags</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside text-sm text-red-600">
                    {result.red_flags.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          <div className="flex gap-2 text-sm text-muted-foreground">
            <span>Type: {result.employment_type}</span>
            <span>|</span>
            <span>
              Location: {result.location.remote_status}
              {result.location.location
                ? ` (${result.location.location})`
                : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
