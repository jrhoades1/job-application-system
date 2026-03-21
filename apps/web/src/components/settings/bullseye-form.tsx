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

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily (every morning)" },
  { value: "weekly", label: "Weekly (Monday morning)" },
  { value: "off", label: "Off (no digest)" },
] as const;

export function BullseyeForm() {
  const [prefs, setPrefs] = useState<BullseyePrefs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [targetRolesRaw, setTargetRolesRaw] = useState("");

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
