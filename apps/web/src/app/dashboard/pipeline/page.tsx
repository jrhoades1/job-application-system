"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { SCORE_CONFIG } from "@/lib/constants";
import type { PipelineLeadRow } from "@/types";

export default function PipelinePage() {
  const [leads, setLeads] = useState<PipelineLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending_review");

  useEffect(() => {
    fetchLeads();
  }, [statusFilter]);

  async function fetchLeads() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/pipeline/leads?${params}`);
    const data = await res.json();
    setLeads(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function handleAction(
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
      toast.success(
        action === "promote" ? "Promoted to tracker" : "Lead skipped"
      );
      fetchLeads();
    } else {
      toast.error("Action failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Job Pipeline</h2>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="promoted">Promoted</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">
              {statusFilter === "pending_review"
                ? "No leads pending review. Connect your email (coming soon) or manually add leads to see them here."
                : "No leads found with this filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const scoreCfg = lead.score_overall
              ? SCORE_CONFIG[
                  lead.score_overall as keyof typeof SCORE_CONFIG
                ]
              : null;

            return (
              <Card key={lead.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {lead.rank && (
                          <span className="text-sm font-mono text-muted-foreground">
                            #{lead.rank}
                          </span>
                        )}
                        <h3 className="font-semibold truncate">
                          {lead.company}
                        </h3>
                        {scoreCfg && (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${scoreCfg.color}`}
                          >
                            {scoreCfg.label}
                            {lead.score_match_percentage != null &&
                              ` ${lead.score_match_percentage}%`}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {lead.role}
                      </p>
                      <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                        {lead.source_platform && (
                          <span>{lead.source_platform}</span>
                        )}
                        {lead.location && <span>| {lead.location}</span>}
                      </div>
                      {lead.red_flags?.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {lead.red_flags.map((f, i) => (
                            <Badge
                              key={i}
                              variant="destructive"
                              className="text-xs"
                            >
                              {f}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {lead.status === "pending_review" && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleAction(lead.id, "promote")}
                        >
                          Promote
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleAction(lead.id, "skip", "Not interested")
                          }
                        >
                          Skip
                        </Button>
                      </div>
                    )}
                    {lead.status !== "pending_review" && (
                      <Badge
                        variant={
                          lead.status === "promoted"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {lead.status}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
