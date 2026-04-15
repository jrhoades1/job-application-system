"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  created_at: string;
}

export function TargetCompaniesForm() {
  const [targets, setTargets] = useState<TargetCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    try {
      const res = await fetch("/api/target-companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ careersUrl: url.trim(), companyName: name.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to add");
        return;
      }
      toast.success(`Watching ${json.target.company_name}`);
      setUrl("");
      setName("");
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
            Supported today: <Badge variant="secondary">Greenhouse</Badge> (e.g.{" "}
            <code>boards.greenhouse.io/stripe</code>). Lever, Ashby, Workday coming soon.
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
              {targets.map((t) => (
                <li key={t.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.company_name}</span>
                      <Badge variant="outline" className="text-xs">
                        {t.ats_vendor}
                      </Badge>
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
                      <p className="text-xs text-red-600 truncate">Error: {t.last_error}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemove(t.id, t.company_name)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
