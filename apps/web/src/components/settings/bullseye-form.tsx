"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { ProfileRow } from "@/types";

type BullseyePrefs = NonNullable<ProfileRow["preferences"]>;

const REMOTE_OPTIONS = [
  { value: "any", label: "Any / No preference" },
  { value: "remote", label: "Remote only" },
  { value: "hybrid", label: "Hybrid OK" },
  { value: "onsite", label: "On-site only" },
] as const;

const SENIORITY_OPTIONS = [
  { value: "any", label: "Any level" },
  { value: "mid", label: "Mid-level or above" },
  { value: "senior", label: "Senior or above" },
  { value: "lead", label: "Lead / Staff or above" },
  { value: "manager", label: "Manager or above" },
  { value: "director", label: "Director or above" },
  { value: "vp", label: "VP or above" },
  { value: "c_level", label: "C-Level only" },
] as const;

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily (every morning)" },
  { value: "weekly", label: "Weekly (Monday morning)" },
  { value: "off", label: "Off (no digest)" },
] as const;

interface ReprocessSummary {
  considered: number;
  stage1_filtered: number;
  stage2_enriched: number;
  stage2_filtered: number;
  enrichment_failed: number;
  bad_descriptions_scrubbed: number;
  dead_jobs_removed: number;
  remaining: number;
  hit_enrichment_cap: boolean;
}

export function BullseyeForm() {
  const [prefs, setPrefs] = useState<BullseyePrefs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [targetRolesRaw, setTargetRolesRaw] = useState("");
  const [reprocessing, setReprocessing] = useState(false);
  const [lastReprocess, setLastReprocess] = useState<ReprocessSummary | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data: ProfileRow) => {
        const p = data?.preferences ?? {};
        setPrefs(p);
        setTargetRolesRaw((p.target_roles ?? []).join(", "));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function update<K extends keyof BullseyePrefs>(key: K, value: BullseyePrefs[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const target_roles = targetRolesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { ...prefs, target_roles },
        }),
      });

      if (!res.ok) throw new Error("Save failed");
      toast.success("Bullseye profile saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleReprocess() {
    if (!(prefs.lead_filter_enabled ?? true)) {
      toast.error("Enable pipeline filtering first, then save.");
      return;
    }
    setReprocessing(true);
    setLastReprocess(null);
    try {
      const res = await fetch("/api/admin/reprocess-leads", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Reprocess failed");
      } else {
        setLastReprocess(data.summary as ReprocessSummary);
        toast.success("Reprocess complete");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setReprocessing(false);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const threshold = prefs.score_threshold ?? 55;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Scoring threshold */}
      <Card>
        <CardHeader>
          <CardTitle>Match Threshold</CardTitle>
          <p className="text-sm text-muted-foreground">
            Only jobs scoring above this percentage are surfaced in your daily digest.
            Default: 55.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={20}
              max={90}
              step={5}
              value={threshold}
              onChange={(e) => update("score_threshold", Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-12 text-right font-mono text-sm font-medium">
              {threshold}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Strong matches: ~80%+ · Good: ~60% · Stretch: ~40%
          </p>
        </CardContent>
      </Card>

      {/* Target roles */}
      <Card>
        <CardHeader>
          <CardTitle>Target Roles</CardTitle>
          <p className="text-sm text-muted-foreground">
            Comma-separated role titles you&apos;re targeting. Used to improve
            estimated scores on digest emails.
          </p>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Director of Engineering, VP of Product, Head of Platform..."
            value={targetRolesRaw}
            onChange={(e) => setTargetRolesRaw(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Salary & location */}
      <Card>
        <CardHeader>
          <CardTitle>Compensation & Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium">Minimum salary (USD/yr)</label>
            <Input
              type="number"
              placeholder="150000"
              value={prefs.salary_min ?? ""}
              onChange={(e) =>
                update("salary_min", e.target.value ? Number(e.target.value) : null)
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              Jobs below this will be flagged but not filtered out.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Remote preference</label>
            <select
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={prefs.remote_preference ?? "any"}
              onChange={(e) =>
                update(
                  "remote_preference",
                  e.target.value as BullseyePrefs["remote_preference"]
                )
              }
            >
              {REMOTE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline filters — Stage 1 knockouts + Stage 2 real-JD floor */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Filters</CardTitle>
          <p className="text-sm text-muted-foreground">
            Auto-skip obvious mismatches before they reach your review queue.
            Knockouts based on role title, location, and salary run at sync time.
            The match-score floor only fires after the real JD is fetched.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="lead-filter-enabled"
              checked={prefs.lead_filter_enabled ?? true}
              onChange={(e) => update("lead_filter_enabled", e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="lead-filter-enabled" className="text-sm font-medium">
              Enable pipeline filtering
            </label>
          </div>

          <div>
            <label className="text-sm font-medium">Minimum match score</label>
            <div className="flex items-center gap-4 mt-1">
              <input
                type="range"
                min={20}
                max={80}
                step={5}
                value={prefs.lead_filter_min_score ?? 40}
                onChange={(e) =>
                  update("lead_filter_min_score", Number(e.target.value))
                }
                className="flex-1"
                disabled={!(prefs.lead_filter_enabled ?? true)}
              />
              <span className="w-12 text-right font-mono text-sm font-medium">
                {prefs.lead_filter_min_score ?? 40}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Only applied to leads with a real JD (fail-open on stub scores so
              good matches aren&apos;t lost).
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Minimum seniority</label>
            <select
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={prefs.min_role_level ?? "any"}
              onChange={(e) => update("min_role_level", e.target.value)}
              disabled={!(prefs.lead_filter_enabled ?? true)}
            >
              {SENIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Leads with an explicit junior / intern title are skipped.
              Ambiguous titles pass through.
            </p>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-1">Reprocess existing leads</p>
            <p className="text-xs text-muted-foreground mb-2">
              Apply these filters retroactively to every lead currently in your
              review queue. Stage 1 runs against all of them (free). Stage 2
              fetches real JDs for up to 30 leads per click (uses AI credits,
              ~$0.01/lead). Save your settings first if you just changed them.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReprocess}
              disabled={reprocessing || !(prefs.lead_filter_enabled ?? true)}
            >
              {reprocessing ? "Reprocessing..." : "Reprocess existing leads"}
            </Button>
            {lastReprocess && (
              <div className="mt-3 rounded border bg-muted/40 p-3 text-xs space-y-1">
                <p className="font-medium">Result</p>
                <p>
                  Considered: <span className="font-mono">{lastReprocess.considered}</span>
                </p>
                <p>
                  Stage 1 filtered (role/location/salary):{" "}
                  <span className="font-mono">{lastReprocess.stage1_filtered}</span>
                </p>
                <p>
                  Stage 2 enriched with real JD:{" "}
                  <span className="font-mono">{lastReprocess.stage2_enriched}</span>
                </p>
                <p>
                  Stage 2 filtered (score below floor):{" "}
                  <span className="font-mono">{lastReprocess.stage2_filtered}</span>
                </p>
                <p>
                  Enrichment failed (couldn&apos;t fetch JD):{" "}
                  <span className="font-mono">{lastReprocess.enrichment_failed}</span>
                </p>
                <p>
                  Bad descriptions scrubbed:{" "}
                  <span className="font-mono">{lastReprocess.bad_descriptions_scrubbed}</span>
                </p>
                <p>
                  Dead jobs removed (404 / no longer available):{" "}
                  <span className="font-mono">{lastReprocess.dead_jobs_removed}</span>
                </p>
                <p>
                  Remaining in review queue:{" "}
                  <span className="font-mono font-semibold">
                    {lastReprocess.remaining}
                  </span>
                </p>
                {lastReprocess.hit_enrichment_cap && (
                  <p className="text-amber-700 pt-1">
                    Hit the 30-lead enrichment cap — click again to continue.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Digest delivery */}
      <Card>
        <CardHeader>
          <CardTitle>Morning Digest</CardTitle>
          <p className="text-sm text-muted-foreground">
            The nightly pipeline runs at 2 AM UTC and optionally sends a digest with
            your top matches.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium">Digest frequency</label>
            <select
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={prefs.digest_frequency ?? "daily"}
              onChange={(e) =>
                update(
                  "digest_frequency",
                  e.target.value as BullseyePrefs["digest_frequency"]
                )
              }
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Digest email address</label>
            <Input
              type="email"
              placeholder="you@example.com (leave blank to use in-app only)"
              value={prefs.digest_email ?? ""}
              onChange={(e) => update("digest_email", e.target.value || null)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Requires RESEND_API_KEY to be configured on the server.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-generate"
              checked={prefs.auto_generate_materials ?? false}
              onChange={(e) => update("auto_generate_materials", e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="auto-generate" className="text-sm">
              Auto-generate tailored resume + cover letter for top 3 daily matches
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Uses AI credits from your monthly budget (~$0.15/job).
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Bullseye Profile"}
      </Button>
    </div>
  );
}
