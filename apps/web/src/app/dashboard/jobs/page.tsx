"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { useGmailSync } from "@/hooks/use-gmail-sync";
import { APPLICATION_STATUSES, STATUS_CONFIG, type ApplicationStatus } from "@/lib/constants";
import { LeadCard } from "@/components/jobs/lead-card";
import { LeadDetailSheet } from "@/components/jobs/lead-detail-sheet";
import {
  ApplicationTable,
  type SortColumn,
  type SortOrder,
} from "@/components/jobs/application-table";
import { AddApplicationDialog } from "@/components/jobs/add-application-dialog";
import { QuickScoreDialog } from "@/components/jobs/quick-score-dialog";
import type { ApplicationWithScores, PipelineLeadRow } from "@/types";
import { KanbanBoard } from "@/components/jobs/kanban-board";

// Tab definitions with status mappings
const TABS = [
  {
    value: "leads",
    label: "New Leads",
    type: "pipeline" as const,
  },
  {
    value: "evaluating",
    label: "Evaluating",
    type: "applications" as const,
    statuses: "evaluating,pending_review,ready_to_apply",
  },
  {
    value: "applied",
    label: "Applied",
    type: "applications" as const,
    statuses: "applied",
  },
  {
    value: "interviewing",
    label: "Interviewing",
    type: "applications" as const,
    statuses: "interviewing",
  },
  {
    value: "offers",
    label: "Offers",
    type: "applications" as const,
    statuses: "offered,accepted",
  },
  {
    value: "closed",
    label: "Closed",
    type: "applications" as const,
    statuses: "rejected,withdrawn",
  },
] as const;

export default function JobsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") ?? "leads";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Pipeline leads state
  const [leads, setLeads] = useState<PipelineLeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadSort, setLeadSort] = useState<"newest" | "score">("newest");
  const [reparsingId, setReparsingId] = useState<string | null>(null);
  const [rescoringId, setRescoringId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<PipelineLeadRow | null>(null);

  // Applications state
  const [applications, setApplications] = useState<ApplicationWithScores[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // View mode
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  // Tab counts
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  // Global search state
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalResults, setGlobalResults] = useState<ApplicationWithScores[]>([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const globalSearchRef = useRef<HTMLDivElement>(null);

  // Close global results on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (globalSearchRef.current && !globalSearchRef.current.contains(e.target as Node)) {
        setShowGlobalResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global search — query all statuses
  useEffect(() => {
    if (!globalSearch.trim()) {
      setGlobalResults([]);
      setShowGlobalResults(false);
      return;
    }
    const timer = setTimeout(async () => {
      // Show dropdown immediately so "Searching..." is visible before the fetch completes
      setGlobalResults([]);
      setGlobalSearching(true);
      setShowGlobalResults(true);
      try {
        const params = new URLSearchParams();
        params.set("search", globalSearch.trim());
        params.set("limit", "15");
        const res = await fetch(`/api/applications?${params}`);
        const json = await res.json();
        setGlobalResults(json.data ?? []);
      } catch {
        setGlobalResults([]);
      }
      setGlobalSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch tab counts on mount and after changes
  const fetchCounts = useCallback(async () => {
    try {
      const [leadsRes, statsRes] = await Promise.all([
        fetch("/api/pipeline/leads?status=pending_review&count_only=true"),
        fetch("/api/dashboard-stats"),
      ]);

      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        const count = Array.isArray(leadsData) ? leadsData.length : 0;
        setTabCounts((prev) => ({ ...prev, leads: count }));
      }

      if (statsRes.ok) {
        const stats = await statsRes.json();
        // We get total, active, interviewing, offered from dashboard-stats
        // For tab counts we need to query individual statuses
        setTabCounts((prev) => ({
          ...prev,
          interviewing: stats.interviewing ?? 0,
          offers: stats.offered ?? 0,
        }));
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts, refreshKey]);

  // Fetch leads when leads tab is active
  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    const params = new URLSearchParams();
    params.set("status", "pending_review");
    if (leadSort === "newest") params.set("sort", "newest");
    try {
      const res = await fetch(`/api/pipeline/leads?${params}`);
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } catch {
      setLeads([]);
    }
    setLeadsLoading(false);
  }, [leadSort]);

  useEffect(() => {
    if (activeTab === "leads") fetchLeads();
  }, [activeTab, fetchLeads]);

  // Fetch applications when an application tab is active
  useEffect(() => {
    const tab = TABS.find((t) => t.value === activeTab);
    if (!tab || tab.type !== "applications") return;
    const statuses = tab.statuses;

    let cancelled = false;
    async function load() {
      setAppsLoading(true);
      const params = new URLSearchParams();
      params.set("status", statuses);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("sort", sortColumn);
      params.set("order", sortOrder);
      try {
        const res = await fetch(`/api/applications?${params}`);
        const json = await res.json();
        if (!cancelled) {
          setApplications(json.data ?? []);
        }
      } catch {
        if (!cancelled) setApplications([]);
      }
      if (!cancelled) setAppsLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, debouncedSearch, sortColumn, sortOrder, refreshKey]);

  // Clear selection on tab/data change
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkStatus("");
  }, [activeTab, refreshKey]);

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  }

  function toggleSelectAll() {
    if (selectedIds.size === applications.length) {
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

  // Pipeline lead actions
  async function handleLeadAction(
    id: string,
    action: "promote" | "skip",
    skipReason?: string
  ) {
    const res = await fetch("/api/pipeline/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, skip_reason: skipReason }),
    });
    if (res.ok) {
      const data = await res.json();
      if (action === "promote" && data.application_id) {
        toast.success("Promoted — preparing your application");
        router.push(`/dashboard/tracker/${data.application_id}?promoted=true`);
      } else {
        toast.success(
          action === "promote" ? "Promoted to tracker" : "Lead skipped"
        );
      }
      fetchLeads();
      setRefreshKey((k) => k + 1);
    } else {
      toast.error("Action failed");
    }
  }

  async function handleRescore(id: string) {
    setRescoringId(id);
    try {
      const res = await fetch("/api/pipeline/rescore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (res.ok && data.rescored) {
        toast.success(
          `${data.score.overall} — ${data.score.match_percentage}% match`
        );
        fetchLeads();
      } else if (res.ok && data.rejected) {
        toast.success(data.message);
        fetchLeads();
      } else if (res.ok) {
        toast.info(data.message);
      } else {
        toast.error(data.error ?? "Score failed");
      }
    } catch {
      toast.error("Score failed");
    } finally {
      setRescoringId(null);
    }
  }

  async function handleReparse(id: string) {
    setReparsingId(id);
    try {
      const res = await fetch("/api/pipeline/reparse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        if (data.new_leads > 0) fetchLeads();
      } else {
        toast.error(data.error ?? "Reparse failed");
      }
    } catch {
      toast.error("Reparse failed");
    } finally {
      setReparsingId(null);
    }
  }

  const { syncing, connected: gmailConnected, sync: handleSync } = useGmailSync({
    onSynced: () => {
      fetchLeads();
      fetchCounts();
    },
  });

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  const currentTab = TABS.find((t) => t.value === activeTab);
  const isAppTab = currentTab?.type === "applications";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Jobs</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode("list")}
            >
              List
            </Button>
            <Button
              variant={viewMode === "board" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode("board")}
            >
              Board
            </Button>
          </div>
          <QuickScoreDialog onSaved={handleRefresh} />
          <AddApplicationDialog onCreated={handleRefresh} />
          {gmailConnected && activeTab === "leads" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync Email"}
            </Button>
          )}
          {gmailConnected === false && activeTab === "leads" && (
            <Button variant="outline" size="sm" asChild>
              <a href="/dashboard/settings">Connect Gmail</a>
            </Button>
          )}
        </div>
      </div>

      {/* Global search */}
      <div ref={globalSearchRef} className="relative">
        <Input
          placeholder="Find any job across all stages..."
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          onFocus={() => {
            if (globalResults.length > 0) setShowGlobalResults(true);
          }}
          className="w-full max-w-md"
        />
        {showGlobalResults && (
          <div className="absolute top-full left-0 z-50 mt-1 w-full max-w-md rounded-md border bg-popover shadow-lg">
            {globalSearching && globalResults.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Searching...</p>
            )}
            {globalResults.length === 0 && !globalSearching && (
              <p className="p-3 text-sm text-muted-foreground">No results found.</p>
            )}
            {globalResults.map((app) => {
              const statusInfo = STATUS_CONFIG[app.status as ApplicationStatus];
              return (
                <a
                  key={app.id}
                  href={`/dashboard/tracker/${app.id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                  onClick={() => setShowGlobalResults(false)}
                >
                  <div className="min-w-0">
                    <span className="font-medium">{app.company}</span>
                    <span className="text-muted-foreground"> — {app.role}</span>
                  </div>
                  <Badge variant={statusInfo?.variant ?? "outline"} className="shrink-0">
                    {statusInfo?.label ?? app.status}
                  </Badge>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Board view */}
      {viewMode === "board" && <KanbanBoard />}

      {/* List view — Tabs */}
      {viewMode === "list" && <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex items-center gap-1.5"
            >
              {tab.label}
              {tabCounts[tab.value] != null && tabCounts[tab.value] > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-[20px] px-1 text-xs"
                >
                  {tabCounts[tab.value]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Leads tab */}
        <TabsContent value="leads" className="space-y-3">
          {activeTab === "leads" && (
            <>
              <div className="flex items-center gap-2">
                <Select
                  value={leadSort}
                  onValueChange={(v) =>
                    setLeadSort(v as "score" | "newest")
                  }
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="score">Best Match</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {leadsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : leads.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <p className="text-muted-foreground text-center">
                      No leads pending review. Sync your email or add jobs
                      manually.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    rescoringId={rescoringId}
                    reparsingId={reparsingId}
                    onRescore={handleRescore}
                    onReparse={handleReparse}
                    onPromote={(id) => handleLeadAction(id, "promote")}
                    onSkip={(id) =>
                      handleLeadAction(id, "skip", "Not interested")
                    }
                    onClick={setSelectedLead}
                  />
                ))
              )}
            </>
          )}
        </TabsContent>

        {/* Application tabs */}
        {TABS.filter((t) => t.type === "applications").map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="space-y-3">
            {activeTab === tab.value && (
              <>
                {/* Search + filters */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Search company or role..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-64"
                  />
                </div>

                {/* Bulk actions bar */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
                    <span className="text-sm font-medium">
                      {selectedIds.size} selected
                    </span>
                    <Select
                      value={bulkStatus}
                      onValueChange={setBulkStatus}
                    >
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

                {/* Table */}
                {appsLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : applications.length === 0 ? (
                  <Card>
                    <CardContent className="py-8">
                      <p className="text-muted-foreground text-center">
                        No applications in this stage.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <ApplicationTable
                    applications={applications}
                    selectedIds={selectedIds}
                    sortColumn={sortColumn}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAll={toggleSelectAll}
                  />
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>}

      {/* Lead detail slide-out */}
      <LeadDetailSheet
        lead={selectedLead}
        open={selectedLead !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLead(null);
        }}
        rescoringId={rescoringId}
        reparsingId={reparsingId}
        onRescore={handleRescore}
        onReparse={handleReparse}
        onPromote={(id) => {
          handleLeadAction(id, "promote");
          setSelectedLead(null);
        }}
        onSkip={(id) => {
          handleLeadAction(id, "skip", "Not interested");
          setSelectedLead(null);
        }}
        onLeadUpdated={(id, updates) => {
          setLeads((prev) => prev.map((l) => l.id === id ? { ...l, ...updates } : l));
          if (selectedLead?.id === id) {
            setSelectedLead({ ...selectedLead, ...updates });
          }
        }}
      />
    </div>
  );
}
