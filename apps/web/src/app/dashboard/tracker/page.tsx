"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { STATUS_CONFIG, SCORE_CONFIG, APPLICATION_STATUSES } from "@/lib/constants";
import type { ApplicationWithScores } from "@/types";

const COMPOSITE_FILTERS: Record<string, { label: string; statuses: string }> = {
  active: { label: "Active", statuses: "applied,interviewing" },
  offers: { label: "Offers", statuses: "offered,accepted" },
};

function resolveFilterFromParams(
  params: URLSearchParams
): string {
  const urlStatus = params.get("status");
  if (!urlStatus) return "all";
  const compositeMatch = Object.entries(COMPOSITE_FILTERS).find(
    ([, v]) => v.statuses === urlStatus
  );
  return compositeMatch ? compositeMatch[0] : urlStatus;
}

type SortColumn = "company" | "role" | "status" | "source" | "applied_date" | "created_at";
type SortOrder = "asc" | "desc";

export default function TrackerPage() {
  const searchParams = useSearchParams();
  const [applications, setApplications] = useState<ApplicationWithScores[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    resolveFilterFromParams(searchParams)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newApp, setNewApp] = useState({
    company: "",
    role: "",
    source: "",
    source_url: "",
    job_description: "",
  });
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [scrapeMode, setScrapeMode] = useState<"url" | "bulk" | "paste">("url");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  }

  // Sync filter when URL params change after mount (e.g. back/forward navigation)
  useEffect(() => {
    const resolved = resolveFilterFromParams(searchParams);
    setStatusFilter((prev) => (prev !== resolved ? resolved : prev));
  }, [searchParams]);

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkStatus("");
  }, [statusFilter, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadApplications() {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        const composite = COMPOSITE_FILTERS[statusFilter];
        params.set("status", composite ? composite.statuses : statusFilter);
      }
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }
      params.set("sort", sortColumn);
      params.set("order", sortOrder);
      const res = await fetch(`/api/applications?${params}`);
      const json = await res.json();
      if (!cancelled) {
        setApplications(json.data ?? []);
        setLoading(false);
      }
    }

    loadApplications();
    return () => { cancelled = true; };
  }, [statusFilter, debouncedSearch, sortColumn, sortOrder, refreshKey]);

  function resetDialog() {
    setNewApp({ company: "", role: "", source: "", source_url: "", job_description: "" });
    setScrapeUrl("");
    setScrapeError("");
    setScrapeMode("url");
    setBulkUrls("");
    setBulkResults(null);
  }

  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResults, setBulkResults] = useState<
    Array<{ url: string; status: string; company?: string; role?: string; error?: string }> | null
  >(null);

  async function handleBulkImport() {
    const urls = bulkUrls
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urls.length === 0) return;
    setBulkImporting(true);
    setBulkResults(null);
    try {
      const res = await fetch("/api/applications/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Bulk import failed");
        return;
      }
      setBulkResults(data.results);
      toast.success(`${data.summary.created} added, ${data.summary.failed} failed`);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error("Bulk import failed");
    } finally {
      setBulkImporting(false);
    }
  }

  async function handleScrape() {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setScrapeError("");
    try {
      const res = await fetch("/api/scrape-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScrapeError(data.error || "Failed to fetch job listing");
        return;
      }
      setNewApp({
        company: data.company || "",
        role: data.role || "",
        source: data.source || "",
        source_url: data.source_url || scrapeUrl.trim(),
        job_description: data.description || "",
      });
      if (data.company || data.role) {
        toast.success("Job details fetched successfully");
      } else {
        setScrapeError("Could not extract job details — please fill in manually");
      }
    } catch {
      setScrapeError("Failed to fetch job listing");
    } finally {
      setScraping(false);
    }
  }

  async function handleCreate() {
    if (!newApp.company || !newApp.role) {
      toast.error("Company and role are required");
      return;
    }
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newApp),
    });
    if (res.ok) {
      const created = await res.json();
      toast.success("Application added");
      setDialogOpen(false);
      resetDialog();
      setRefreshKey((k) => k + 1);

      // Auto-score in background if we have a job description
      if (newApp.job_description && created.id) {
        fetch(`/api/applications/${created.id}/score`, { method: "POST" })
          .then((r) => {
            if (r.ok) {
              toast.success(`${newApp.company} scored automatically`);
              setRefreshKey((k) => k + 1);
            }
          })
          .catch(() => {
            // Silent — user can score manually later
          });
      }
    } else {
      toast.error("Failed to add application");
    }
  }

  const allSelected =
    applications.length > 0 && selectedIds.size === applications.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < applications.length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(applications.map((a) => a.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkStatusUpdate() {
    if (selectedIds.size === 0 || !bulkStatus) return;
    setBulkUpdating(true);
    try {
      const res = await fetch("/api/applications/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          status: bulkStatus,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(
          `Updated ${result.updated} application${result.updated !== 1 ? "s" : ""}`
        );
        setSelectedIds(new Set());
        setBulkStatus("");
        setRefreshKey((k) => k + 1);
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to update applications");
      }
    } catch {
      toast.error("Failed to update applications");
    } finally {
      setBulkUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Application Tracker</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetDialog();
        }}>
          <DialogTrigger asChild>
            <Button>Add Application</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Application</DialogTitle>
            </DialogHeader>

            {/* Mode tabs */}
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {([
                ["url", "From URL"],
                ["bulk", "Bulk Import"],
                ["paste", "Paste JD"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setScrapeMode(mode)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    scrapeMode === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* URL mode */}
            {scrapeMode === "url" && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Job Listing URL</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={scrapeUrl}
                      onChange={(e) => setScrapeUrl(e.target.value)}
                      placeholder="https://..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleScrape();
                        }
                      }}
                    />
                    <Button
                      variant="secondary"
                      onClick={handleScrape}
                      disabled={scraping || !scrapeUrl.trim()}
                    >
                      {scraping ? "Fetching..." : "Fetch"}
                    </Button>
                  </div>
                  {scrapeError && (
                    <p className="text-sm text-destructive mt-1">
                      {scrapeError}
                      {" — "}
                      <button
                        type="button"
                        className="underline text-foreground hover:text-foreground/80"
                        onClick={() => setScrapeMode("paste")}
                      >
                        paste the job description instead
                      </button>
                    </p>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      details
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Company</label>
                  <Input
                    value={newApp.company}
                    onChange={(e) =>
                      setNewApp({ ...newApp, company: e.target.value })
                    }
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Role</label>
                  <Input
                    value={newApp.role}
                    onChange={(e) =>
                      setNewApp({ ...newApp, role: e.target.value })
                    }
                    placeholder="Job title"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Source</label>
                  <Input
                    value={newApp.source}
                    onChange={(e) =>
                      setNewApp({ ...newApp, source: e.target.value })
                    }
                    placeholder="LinkedIn, Indeed, etc."
                  />
                </div>
                {newApp.job_description && (
                  <p className="text-xs text-muted-foreground">
                    {newApp.job_description.length.toLocaleString()} characters scraped
                  </p>
                )}
                <Button onClick={handleCreate} className="w-full">
                  Add
                </Button>
              </div>
            )}

            {/* Bulk import mode */}
            {scrapeMode === "bulk" && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Job Listing URLs</label>
                  <p className="text-xs text-muted-foreground mb-1">
                    One URL per line (max 20)
                  </p>
                  <Textarea
                    value={bulkUrls}
                    onChange={(e) => setBulkUrls(e.target.value)}
                    placeholder={"https://linkedin.com/jobs/...\nhttps://indeed.com/viewjob?..."}
                    rows={6}
                  />
                </div>
                <Button
                  onClick={handleBulkImport}
                  className="w-full"
                  disabled={bulkImporting || !bulkUrls.trim()}
                >
                  {bulkImporting
                    ? `Importing ${bulkUrls.split("\n").filter((u) => u.trim()).length} jobs...`
                    : `Import ${bulkUrls.split("\n").filter((u) => u.trim()).length || 0} URLs`}
                </Button>
                {bulkResults && (
                  <div className="space-y-1 max-h-48 overflow-y-auto text-sm">
                    {bulkResults.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 rounded p-2 ${
                          r.status === "created" ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"
                        }`}
                      >
                        <span>{r.status === "created" ? "\u2713" : "\u2717"}</span>
                        <div className="min-w-0 flex-1">
                          {r.status === "created" ? (
                            <span className="font-medium">{r.company} — {r.role}</span>
                          ) : (
                            <span className="text-destructive">{r.error}</span>
                          )}
                          <p className="text-xs text-muted-foreground truncate">{r.url}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Paste JD mode */}
            {scrapeMode === "paste" && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Company</label>
                  <Input
                    value={newApp.company}
                    onChange={(e) =>
                      setNewApp({ ...newApp, company: e.target.value })
                    }
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Role</label>
                  <Input
                    value={newApp.role}
                    onChange={(e) =>
                      setNewApp({ ...newApp, role: e.target.value })
                    }
                    placeholder="Job title"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Source</label>
                  <Input
                    value={newApp.source}
                    onChange={(e) =>
                      setNewApp({ ...newApp, source: e.target.value })
                    }
                    placeholder="LinkedIn, Indeed, etc."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Job Description</label>
                  <Textarea
                    value={newApp.job_description}
                    onChange={(e) =>
                      setNewApp({ ...newApp, job_description: e.target.value })
                    }
                    placeholder="Paste the full job description here..."
                    rows={8}
                  />
                  {newApp.job_description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {newApp.job_description.length.toLocaleString()} characters
                    </p>
                  )}
                </div>
                <Button onClick={handleCreate} className="w-full">
                  Add
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search company or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-64"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="offers">Offers</SelectItem>
            {APPLICATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Change status to..." />
            </SelectTrigger>
            <SelectContent>
              {APPLICATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_CONFIG[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleBulkStatusUpdate}
            disabled={!bulkStatus || bulkUpdating}
          >
            {bulkUpdating ? "Updating..." : "Apply"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedIds(new Set());
              setBulkStatus("");
            }}
          >
            Clear
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading applications...</div>
      ) : applications.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No applications yet. Click &quot;Add Application&quot; to get started.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all applications"
                />
              </TableHead>
              {([
                ["company", "Company"],
                ["role", "Role"],
                ["status", "Status"],
              ] as const).map(([col, label]) => (
                <TableHead
                  key={col}
                  className="cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort(col)}
                >
                  {label} {sortColumn === col ? (sortOrder === "asc" ? "\u25B2" : "\u25BC") : ""}
                </TableHead>
              ))}
              <TableHead>Score</TableHead>
              {([
                ["source", "Source"],
                ["applied_date", "Date"],
              ] as const).map(([col, label]) => (
                <TableHead
                  key={col}
                  className="cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort(col)}
                >
                  {label} {sortColumn === col ? (sortOrder === "asc" ? "\u25B2" : "\u25BC") : ""}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app) => {
              const statusCfg =
                STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG];
              const score = Array.isArray(app.match_scores)
                ? app.match_scores[0]
                : app.match_scores;
              const scoreCfg = score?.overall
                ? SCORE_CONFIG[score.overall as keyof typeof SCORE_CONFIG]
                : null;
              const matchPct = score?.match_percentage
                ?? (score ? (() => {
                    const s = score.strong_count ?? 0;
                    const p = score.partial_count ?? 0;
                    const total = s + p + (score.gap_count ?? 0);
                    return total > 0 ? Math.round(((s + p * 0.5) / total) * 1000) / 10 : null;
                  })()
                : null);

              return (
                <TableRow
                  key={app.id}
                  data-state={selectedIds.has(app.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(app.id)}
                      onCheckedChange={() => toggleSelect(app.id)}
                      aria-label={`Select ${app.company}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/tracker/${app.id}`}
                      className="font-medium hover:underline"
                    >
                      {app.company}
                    </Link>
                  </TableCell>
                  <TableCell>{app.role}</TableCell>
                  <TableCell>
                    <Badge variant={statusCfg?.variant ?? "secondary"}>
                      {statusCfg?.label ?? app.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {scoreCfg ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${scoreCfg.color}`}
                      >
                        {scoreCfg.label}
                        {matchPct != null && ` ${matchPct}%`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {app.source ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {app.applied_date ?? app.created_at?.slice(0, 10) ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
