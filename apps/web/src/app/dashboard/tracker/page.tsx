"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export default function TrackerPage() {
  const [applications, setApplications] = useState<ApplicationWithScores[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newApp, setNewApp] = useState({ company: "", role: "", source: "" });

  async function loadApplications() {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/applications?${params}`);
    const json = await res.json();
    setApplications(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadApplications();
  }, [statusFilter]);

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
      loadApplications();
    } else {
      toast.error("Failed to add application");
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
            {APPLICATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

              return (
                <TableRow key={app.id}>
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
