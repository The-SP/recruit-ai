"use client";

import {
  ArrowDown, ArrowUp, ChevronDown, ChevronUp, FileText, Loader2,
} from "lucide-react";
import React from "react";

import { CandidateBreakdownPanel } from "@/components/evaluation/candidate-breakdown-panel";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { scoreBarColor, signalLabels, signalStyles } from "@/lib/evaluation-styles";
import { MAX_COMPARE, type EvaluationItem, type SortBy } from "@/lib/evaluation-types";
import type { CandidateBreakdown } from "@/services/batch";

type CachedBreakdown = CandidateBreakdown | "loading" | "error";

interface ResultsTableProps<T extends EvaluationItem> {
  items: T[];
  pendingItems: T[];
  expandedIds: Set<string>;
  breakdownCache: Record<string, CachedBreakdown>;
  compareIds: Set<string>;
  sortBy: SortBy;
  onSort: () => void;
  onRowClick: (item: T) => void;
  onToggleCompare: (id: string) => void;
  onViewResume: (e: React.MouseEvent, item: T) => void;
  onExpandAll: () => void;
  allExpanded: boolean;
  isProcessing: boolean;
  isFiltered: boolean;
  onClearFilters: () => void;
  showEmptyFilterRow: boolean;
  // Returns candidate_id (public) or item_id (dashboard) — the value used to
  // track a row in the compare selection and its expansion.
  getCompareId: (item: T) => string;
  // Key used to look up this row's breakdown in breakdownCache.
  getBreakdownKey: (item: T) => string | null;
  // Optional per-row action rendered in the action cell (e.g. retry button on
  // the public page). Returning null falls back to the expand chevron.
  renderRowAction?: (item: T) => React.ReactNode;
}

export function ResultsTable<T extends EvaluationItem>({
  items,
  pendingItems,
  expandedIds,
  breakdownCache,
  compareIds,
  sortBy,
  onSort,
  onRowClick,
  onToggleCompare,
  onViewResume,
  onExpandAll,
  allExpanded,
  isProcessing,
  isFiltered,
  onClearFilters,
  showEmptyFilterRow,
  getCompareId,
  getBreakdownKey,
  renderRowAction,
}: ResultsTableProps<T>) {
  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-foreground/[0.06] hover:bg-foreground/[0.06] border-b-2 border-foreground/15">
            <TableHead className="w-12 text-center">
              <span className="sr-only">Select for comparison</span>
            </TableHead>
            <TableHead className="w-20 text-center">Rank</TableHead>
            <TableHead>
              <button
                onClick={onSort}
                className="flex items-center gap-1 font-semibold hover:text-foreground transition-colors cursor-pointer"
              >
                Resume
                {sortBy === "name_asc" && <ArrowUp className="w-3 h-3 text-primary" />}
                {sortBy === "name_desc" && <ArrowDown className="w-3 h-3 text-primary" />}
              </button>
            </TableHead>
            <TableHead className="w-32 text-center">
              <span className="flex items-center justify-center gap-1 font-semibold">
                Score
                <ArrowDown className={cn("w-3 h-3", sortBy === "score_desc" ? "text-primary" : "text-transparent")} />
              </span>
            </TableHead>
            <TableHead className="w-40 text-center">Hire Signal</TableHead>
            <TableHead className="w-24 text-right pr-4">
              <button
                onClick={onExpandAll}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {allExpanded ? "Collapse all" : "Expand all"}
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr]:border-foreground/10">
          {showEmptyFilterRow && isFiltered ? (
            <TableRow>
              <TableCell colSpan={6} className="py-16 text-center">
                <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">No candidates match your filters.</p>
                <button
                  onClick={onClearFilters}
                  className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Clear filters
                </button>
              </TableCell>
            </TableRow>
          ) : null}

          {items.map((item, index) => {
            const compareId = getCompareId(item);
            const isExpanded = expandedIds.has(compareId);
            const isFailed = item.status === "failed";
            const scorePct = item.final_score != null ? Math.round(item.final_score * 100) : null;
            const breakdownKey = getBreakdownKey(item);
            const breakdown = breakdownKey ? breakdownCache[breakdownKey] : undefined;
            const rowAction = renderRowAction?.(item);

            return (
              <React.Fragment key={item.item_id}>
                <TableRow
                  onClick={() => !isFailed && onRowClick(item)}
                  className={cn(
                    "select-none",
                    isFailed ? "opacity-60" : "cursor-pointer",
                    isExpanded && "bg-muted/50"
                  )}
                >
                  <TableCell
                    className="text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isFailed && item.candidate_id && (
                      <Checkbox
                        checked={compareIds.has(compareId)}
                        onCheckedChange={() => onToggleCompare(compareId)}
                        disabled={!compareIds.has(compareId) && compareIds.size >= MAX_COMPARE}
                        aria-label={`Select ${item.candidate_name ?? item.filename} for comparison`}
                        title={
                          !compareIds.has(compareId) && compareIds.size >= MAX_COMPARE
                            ? `You can compare up to ${MAX_COMPARE} candidates`
                            : "Select for comparison"
                        }
                        className="cursor-pointer align-middle"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-center font-bold">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <FileText className={cn("w-5 h-5 shrink-0", isFailed ? "text-error-border" : "text-muted-foreground")} />
                      <div>
                        <span className="font-medium truncate">
                          {item.candidate_name ?? item.filename}
                        </span>
                        {item.candidate_name && (
                          <p className="text-xs text-muted-foreground">{item.filename}</p>
                        )}
                        {isFailed && (
                          <p className="text-xs text-error-foreground font-medium mt-0.5">Evaluation failed</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {scorePct != null ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="font-bold">{scorePct}%</span>
                        <Progress
                          value={scorePct}
                          className={cn("h-1 w-16", scoreBarColor(item.final_score!))}
                        />
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {item.hire_signal ? (
                      <Badge variant="outline" className={signalStyles[item.hire_signal] ?? ""}>
                        {signalLabels[item.hire_signal] || item.hire_signal}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right pr-3 w-24">
                    <div className="flex items-center justify-end gap-1">
                      {!isFailed && item.candidate_id && (
                        <button
                          onClick={(e) => onViewResume(e, item)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          title="View resume"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      {rowAction != null
                        ? rowAction
                        : (!isFailed && item.candidate_id && (
                            isExpanded
                              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ))}
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0 border-b-0 whitespace-normal">
                    <CandidateBreakdownPanel
                      key={`${compareId}-${isExpanded}`}
                      breakdown={breakdown}
                      isExpanded={isExpanded}
                    />
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}

          {/* Skeleton rows for candidates still being processed */}
          {isProcessing && pendingItems.map((item, i) => (
            <TableRow key={`pending-${item.filename}-${i}`} className="opacity-50">
              <TableCell />
              <TableCell className="text-center">
                <div className="h-4 w-4 rounded bg-muted animate-pulse mx-auto" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-40 rounded bg-muted animate-pulse" />
                    <div className="h-2.5 w-28 rounded bg-muted/50 animate-pulse" />
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className="h-3.5 w-10 rounded bg-muted animate-pulse mx-auto" />
              </TableCell>
              <TableCell className="text-center">
                <div className="h-6 w-24 rounded-full bg-muted/50 animate-pulse mx-auto" />
              </TableCell>
              <TableCell />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
