import Link from "next/link";
import { ChevronRight, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EvaluationRunSummary } from "@/services/runs";
import { statusLabels, statusStyles } from "@/lib/evaluation-styles";

/**
 * The owned-runs table shared by the dashboard and /history.
 *
 * The whole row opens the run, via a real link on the job title stretched
 * over the row (`after:absolute after:inset-0` against the `relative` row)
 * rather than an onClick on <tr>, so cmd/middle-click, the status-bar URL and
 * keyboard focus all keep working. Anything else clickable in a row must sit
 * above that overlay with `relative z-10`, as the delete button does.
 */
export function RunsTable({
  runs,
  onDelete,
  showTime = false,
}: {
  runs: EvaluationRunSummary[];
  onDelete: (run: EvaluationRunSummary) => void;
  showTime?: boolean;
}) {
  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
      <Table className="[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4">
        <TableHeader>
          <TableRow className="bg-foreground/[0.06] hover:bg-foreground/[0.06] border-b-2 border-foreground/15">
            <TableHead>Date</TableHead>
            <TableHead>Job title</TableHead>
            <TableHead>Company</TableHead>
            <TableHead className="text-center">Candidates</TableHead>
            {showTime && <TableHead className="text-center">Time</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr]:border-foreground/10 [&_td]:py-3">
          {runs.map((run) => (
            <TableRow
              key={run.id}
              className="relative group hover:bg-foreground/[0.04] focus-within:bg-foreground/[0.04]"
            >
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {new Date(run.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </TableCell>
              <TableCell className="font-medium">
                <Link
                  href={`/evaluation/${run.id}`}
                  className="outline-none after:absolute after:inset-0 focus-visible:underline"
                >
                  {run.job_title ?? (
                    <span className="text-muted-foreground italic">Untitled</span>
                  )}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {run.company_name && run.company_name !== "null"
                  ? run.company_name
                  : "—"}
              </TableCell>
              <TableCell className="text-center text-sm">{run.total_count}</TableCell>
              {showTime && (
                <TableCell className="text-center text-sm text-muted-foreground">
                  {run.processing_time_seconds != null
                    ? `${run.processing_time_seconds.toFixed(0)}s`
                    : "—"}
                </TableCell>
              )}
              <TableCell>
                <Badge
                  className={
                    statusStyles[run.status] ??
                    "bg-muted text-muted-foreground border-border"
                  }
                  variant="outline"
                >
                  {statusLabels[run.status] ?? run.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete run ${run.job_title ?? "untitled"}`}
                    className="relative z-10 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(run)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
