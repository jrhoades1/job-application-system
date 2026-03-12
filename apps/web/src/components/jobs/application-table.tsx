"use client";

import Link from "next/link";
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
import { STATUS_CONFIG, SCORE_CONFIG } from "@/lib/constants";
import type { ApplicationWithScores } from "@/types";

type SortColumn =
  | "company"
  | "role"
  | "status"
  | "source"
  | "applied_date"
  | "created_at";
type SortOrder = "asc" | "desc";

interface ApplicationTableProps {
  applications: ApplicationWithScores[];
  selectedIds: Set<string>;
  sortColumn: SortColumn;
  sortOrder: SortOrder;
  onSort: (column: SortColumn) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

export function ApplicationTable({
  applications,
  selectedIds,
  sortColumn,
  sortOrder,
  onSort,
  onToggleSelect,
  onToggleSelectAll,
}: ApplicationTableProps) {
  const allSelected =
    applications.length > 0 && selectedIds.size === applications.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < applications.length;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Checkbox
              checked={
                allSelected ? true : someSelected ? "indeterminate" : false
              }
              onCheckedChange={onToggleSelectAll}
              aria-label="Select all applications"
            />
          </TableHead>
          {(
            [
              ["company", "Company"],
              ["role", "Role"],
              ["status", "Status"],
            ] as const
          ).map(([col, label]) => (
            <TableHead
              key={col}
              className="cursor-pointer select-none hover:text-foreground"
              onClick={() => onSort(col)}
            >
              {label}{" "}
              {sortColumn === col
                ? sortOrder === "asc"
                  ? "\u25B2"
                  : "\u25BC"
                : ""}
            </TableHead>
          ))}
          <TableHead>Score</TableHead>
          {(
            [
              ["source", "Source"],
              ["applied_date", "Date"],
            ] as const
          ).map(([col, label]) => (
            <TableHead
              key={col}
              className="cursor-pointer select-none hover:text-foreground"
              onClick={() => onSort(col)}
            >
              {label}{" "}
              {sortColumn === col
                ? sortOrder === "asc"
                  ? "\u25B2"
                  : "\u25BC"
                : ""}
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
          const matchPct =
            score?.match_percentage ??
            (score
              ? (() => {
                  const s = score.strong_count ?? 0;
                  const p = score.partial_count ?? 0;
                  const total = s + p + (score.gap_count ?? 0);
                  return total > 0
                    ? Math.round(((s + p * 0.5) / total) * 1000) / 10
                    : null;
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
                  onCheckedChange={() => onToggleSelect(app.id)}
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
  );
}

export type { SortColumn, SortOrder };
