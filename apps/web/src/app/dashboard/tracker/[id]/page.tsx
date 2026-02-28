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
import { toast } from "sonner";
import { STATUS_CONFIG, SCORE_CONFIG, APPLICATION_STATUSES } from "@/lib/constants";
import type { ApplicationWithScores } from "@/types";

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [app, setApp] = useState<ApplicationWithScores | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [generatingCL, setGeneratingCL] = useState(false);
  const [tailoredResume, setTailoredResume] = useState<string | null>(null);
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
        toast.success("Resume tailored");
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

  if (loading) return <div className="text-muted-foreground">Loading...</div>;
  if (!app) return <div className="text-muted-foreground">Not found.</div>;

  const score = Array.isArray(app.match_scores)
    ? app.match_scores[0]
    : app.match_scores;
  const scoreCfg = score?.overall
    ? SCORE_CONFIG[score.overall as keyof typeof SCORE_CONFIG]
    : null;
  const statusCfg = STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{app.company}</h2>
          <p className="text-lg text-muted-foreground">{app.role}</p>
        </div>
        <div className="flex gap-2 items-center">
          {scoreCfg && (
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${scoreCfg.color}`}
            >
              {scoreCfg.label}
            </span>
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

      {/* AI Actions */}
      <Card>
        <CardHeader>
          <CardTitle>AI Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
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

          {tailoredResume && (
            <div>
              <h4 className="text-sm font-medium mb-2">Tailored Resume</h4>
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
                {tailoredResume}
              </pre>
            </div>
          )}

          {coverLetter && (
            <div>
              <h4 className="text-sm font-medium mb-2">Cover Letter</h4>
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
                {coverLetter}
              </pre>
            </div>
          )}

          {app.cover_letter && !coverLetter && (
            <div>
              <h4 className="text-sm font-medium mb-2">Saved Cover Letter</h4>
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
                {app.cover_letter}
              </pre>
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
