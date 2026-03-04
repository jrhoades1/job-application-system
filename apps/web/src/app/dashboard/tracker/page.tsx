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

export default function TrackerPage() {
  const searchParams = useSearchParams();
  const [applications, setApplications] = useState<ApplicationWithScores[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    resolveFilterFromParams(searchParams)
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newApp, setNewApp] = useState({ company: "", role: "", source: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkUpdating, setBulkUpdating] = useState(false);

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
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        const composite = COMPOSITE_FILTERS[statusFilter];
        params.set("status", composite ? composite.statuses : statusFilter);
      }
      const res = await fetch(`/api/applications?${params}`);
      const json = await res.json();
      if (!cancelled) {
        setApplications(json.data ?? []);
        setLoading(false);
      }
    }

    loadApplications();
    return () => { cancelled = true; };
  }, [statusFilter, refreshKey]);

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
      toast.success("Application added");
      setDialogOpen(false);
      setNewApp({ company: "", role: "", source: "" });
      setRefreshKey((k) => k + 1);
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>Add Application</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Application</DialogTitle>
            </DialogHeader>
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
              <Button onClick={handleCreate} className="w-full">
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2">
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
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Date</TableHead>
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
