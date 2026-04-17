"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface TargetCompany {
  id: string;
  company_name: string;
  careers_url: string;
  ats_vendor: string;
  ats_identifier: string;
  active: boolean;
  last_scanned_at: string | null;
  last_error: string | null;
  applied_facets?: Record<string, string[]> | null;
  created_at: string;
}

const EMPTY_FACETS = "{}";

function formatFacets(f: Record<string, string[]> | null | undefined): string {
  if (!f || Object.keys(f).length === 0) return EMPTY_FACETS;
  return JSON.stringify(f, null, 2);
}

function parseFacets(text: string): Record<string, string[]> | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: "Not valid JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Must be a JSON object, e.g. {\"jobFamilyGroup\": [\"<id>\"]}" };
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
      return { error: `Key "${k}" must map to an array of strings` };
    }
    out[k] = v as string[];
  }
  return out;
}

export function TargetCompaniesForm() {
  const [targets, setTargets] = useState<TargetCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [facetsText, setFacetsText] = useState(EMPTY_FACETS);
  const [submitting, setSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<TargetCompany | null>(null);
  const [editText, setEditText] = useState(EMPTY_FACETS);
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/target-companies");
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setTargets(json.targets ?? []);
    } catch {
      toast.error("Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    const facets = parseFacets(facetsText);
    if ("error" in facets) {
      toast.error(`Facets: ${facets.error}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/target-companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          careersUrl: url.trim(),
          companyName: name.trim() || undefined,
          appliedFacets: Object.keys(facets).length > 0 ? facets : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to add");
        return;
      }
      toast.success(`Watching ${json.target.company_name}`);
      setUrl("");
      setName("");
      setFacetsText(EMPTY_FACETS);
      await load();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string, companyName: string) {
    if (!confirm(`Stop watching ${companyName}? Existing leads are kept.`)) return;
    try {
      const res = await fetch(`/api/target-companies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to remove");
        return;
      }
      toast.success(`Removed ${companyName}`);
      await load();
    } catch {
      toast.error("Something went wrong");
    }
  }

  function openEdit(t: TargetCompany) {
    setEditTarget(t);
    setEditText(formatFacets(t.applied_facets));
  }

  async function handleSaveFacets() {
    if (!editTarget) return;
    const facets = parseFacets(editText);
    if ("error" in facets) {
      toast.error(`Facets: ${facets.error}`);
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/target-companies/${editTarget.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appliedFacets: facets }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save");
        return;
      }
      toast.success(`Updated filters for ${editTarget.company_name}`);
      setEditTarget(null);
      await load();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Target Companies</CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste a company&apos;s careers URL and the system will poll it hourly. New
            roles become pipeline leads automatically — no email alerts needed.
          </p>
          <p className="text-xs text-muted-foreground">
            Supported: <Badge variant="secondary">Greenhouse</Badge>{" "}
            <Badge variant="secondary">Workday</Badge>. Lever, Ashby coming soon.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="text-sm font-medium">Careers URL</label>
              <Input
                placeholder="https://boards.greenhouse.io/stripe"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Company name <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                placeholder="Auto-detected from URL"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Workday filter (optional, advanced)
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  For Workday tenants with 500+ postings, restrict to relevant
                  categories. Paste a JSON object matching Workday&apos;s{" "}
                  <code>appliedFacets</code> shape. Find facet IDs by opening
                  the careers page in DevTools &rarr; Network &rarr; filter on a
                  category &rarr; inspect the <code>/jobs</code> POST body.
                </p>
                <Textarea
                  className="font-mono text-xs"
                  rows={5}
                  placeholder={`{"jobFamilyGroup": ["id1", "id2"]}`}
                  value={facetsText}
                  onChange={(e) => setFacetsText(e.target.value)}
                />
              </div>
            </details>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Target"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Watchlist ({targets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No target companies yet. Add one above to start proactive job discovery.
            </p>
          ) : (
            <ul className="divide-y">
              {targets.map((t) => {
                const hasFacets =
                  t.applied_facets && Object.keys(t.applied_facets).length > 0;
                return (
                  <li
                    key={t.id}
                    className="py-3 flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t.company_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {t.ats_vendor}
                        </Badge>
                        {hasFacets && (
                          <Badge variant="secondary" className="text-xs">
                            filtered
                          </Badge>
                        )}
                      </div>
                      <a
                        href={t.careers_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:underline truncate block"
                      >
                        {t.careers_url}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {t.last_scanned_at
                          ? `Last scanned: ${new Date(t.last_scanned_at).toLocaleString()}`
                          : "Never scanned"}
                      </p>
                      {t.last_error && (
                        <p className="text-xs text-red-600 truncate">
                          Error: {t.last_error}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {t.ats_vendor === "workday" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(t)}
                        >
                          {hasFacets ? "Edit filter" : "Add filter"}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemove(t.id, t.company_name)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Workday filter for {editTarget?.company_name}
            </DialogTitle>
            <DialogDescription>
              Restricts the scan to matching categories only. Set to{" "}
              <code>{"{}"}</code> to scan everything.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="font-mono text-xs"
            rows={8}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveFacets} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
