"use client";

import { useEffect, useState } from "react";
import { STATUS_CONFIG, type ApplicationStatus } from "@/lib/constants";
import { KanbanCard } from "./kanban-card";
import type { ApplicationWithScores } from "@/types";

const KANBAN_COLUMNS: { status: ApplicationStatus; label: string }[] = [
  { status: "evaluating", label: "Evaluating" },
  { status: "ready_to_apply", label: "Ready to Apply" },
  { status: "applied", label: "Applied" },
  { status: "interviewing", label: "Interviewing" },
  { status: "offered", label: "Offered" },
];

export function KanbanBoard() {
  const [columns, setColumns] = useState<
    Record<string, ApplicationWithScores[]>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const statuses = KANBAN_COLUMNS.map((c) => c.status).join(",");
      try {
        const res = await fetch(
          `/api/applications?status=${statuses}&sort=created_at&order=desc&limit=200`
        );
        const json = await res.json();
        const apps: ApplicationWithScores[] = json.data ?? [];

        const grouped: Record<string, ApplicationWithScores[]> = {};
        for (const col of KANBAN_COLUMNS) {
          grouped[col.status] = [];
        }
        // pending_review gets grouped with evaluating
        for (const app of apps) {
          const key =
            app.status === "pending_review" ? "evaluating" : app.status;
          if (grouped[key]) {
            grouped[key].push(app);
          }
        }
        setColumns(grouped);
      } catch {
        setColumns({});
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <p className="text-muted-foreground">Loading board...</p>;
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((col) => {
        const apps = columns[col.status] ?? [];
        const cfg = STATUS_CONFIG[col.status];
        return (
          <div
            key={col.status}
            className="flex-shrink-0 w-64 bg-muted/30 rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {apps.length}
              </span>
            </div>
            <div className="space-y-2">
              {apps.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  None
                </p>
              )}
              {apps.map((app) => (
                <KanbanCard key={app.id} app={app} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
