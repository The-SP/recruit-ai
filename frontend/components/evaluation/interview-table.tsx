"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import React from "react";

import { DemoNotice } from "@/components/demo-notice";
import { assessmentCopy } from "@/components/interview/assessment-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  interviewStatusLabels,
  interviewStatusStyles,
  recommendationLabels,
  recommendationStyles,
  scoreBarColor,
} from "@/lib/evaluation-styles";
import { cn } from "@/lib/utils";
import type { RunItemSummary } from "@/services/runs";

/**
 * The Interviews tab: one row per candidate, whether or not an interview
 * exists, so it doubles as the surface for starting them.
 *
 * Unlike its neighbours in this directory it serves only the authenticated
 * page — the anonymous flow can never have interviews. It stays flow-agnostic
 * all the same (props only, no useAuth, no service import), so the page owns
 * every call.
 *
 * The action for each row mirrors the state machine in InterviewSection; the
 * two surfaces drive the same callbacks, so they can't disagree about what a
 * given status affords.
 */

export type InterviewSortColumn =
  | "candidate"
  | "score"
  | "status"
  | "recommendation"
  | "date";

/** `column: null` is the unsorted default (score, best first). Each header
 *  cycles desc -> asc -> unsorted, so a sort can always be undone. */
export interface InterviewSort {
  column: InterviewSortColumn | null;
  dir: "asc" | "desc";
}

/** The direction a column sorts on its first click: names read most naturally
 *  A-Z, everything else is most useful best-first. Shared with the page's sort
 *  cycle so the header's tooltip can't promise a direction the click doesn't
 *  take. */
export function firstSortDir(column: InterviewSortColumn): "asc" | "desc" {
  return column === "candidate" ? "asc" : "desc";
}

/** The timestamp the Date column shows, as a sortable number. Rows with no
 *  date sort last in either direction. */
export function interviewSortDate(item: RunItemSummary): number {
  const iv = item.interview;
  if (!iv) return 0;
  const stamp =
    iv.status === "assessed" || iv.status === "completed"
      ? iv.assessed_at ?? iv.completed_at
      : iv.expires_at;
  return stamp ? new Date(stamp).getTime() : 0;
}

/** "Oct 4", with the year only when it isn't this year: the column sits
 *  beside two badges and the actions, so a full date pushed the table wide. */
function formatDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear() && { year: "numeric" }),
  });
}

/** A sortable column header. Module scope, not nested in InterviewTable, so
 *  it isn't recreated on every render. */
function SortHeader({
  column,
  label,
  sort,
  onSort,
  className,
  noTitle,
}: {
  column: InterviewSortColumn;
  label: string;
  sort: InterviewSort;
  onSort: (column: InterviewSortColumn) => void;
  className?: string;
  // Set when a Radix tooltip already wraps this header, so the two don't
  // both fire on hover.
  noTitle?: boolean;
}) {
  const active = sort.column === column;
  // The third click of a column's cycle is the one that clears it.
  const firstDir = firstSortDir(column);
  // No arrow in the unsorted state, deliberately: the default order happens
  // to follow score, but this header isn't driving it, and a lit arrow whose
  // column reorders when clicked reads as broken.
  const hint = !active
    ? `Sort by ${label}`
    : sort.dir === firstDir
      ? "Click to reverse"
      : "Click to clear sorting";
  return (
    <button
      onClick={() => onSort(column)}
      title={noTitle ? undefined : hint}
      className={cn(
        "flex items-center gap-1 font-semibold hover:text-foreground transition-colors cursor-pointer",
        className
      )}
    >
      {label}
      {active ? (
        sort.dir === "asc" ? (
          <ArrowUp className="w-3 h-3 text-primary shrink-0" />
        ) : (
          <ArrowDown className="w-3 h-3 text-primary shrink-0" />
        )
      ) : (
        // Reserve the space so headers don't shift when sorting changes.
        <ArrowDown className="w-3 h-3 text-transparent shrink-0" />
      )}
    </button>
  );
}

function InterviewDate({ item }: { item: RunItemSummary }) {
  const iv = item.interview;
  if (!iv) return <span className="text-muted-foreground">—</span>;

  if (iv.status === "assessed" || iv.status === "completed") {
    const done = iv.assessed_at ?? iv.completed_at;
    return <span>{done ? `Completed ${formatDate(done)}` : "—"}</span>;
  }
  // A draft has no expiry until its questions are approved.
  if (!iv.expires_at) return <span className="text-muted-foreground">—</span>;
  if (iv.status === "expired") {
    return (
      <span className="text-muted-foreground">
        Expired {formatDate(iv.expires_at)}
      </span>
    );
  }
  return <span>Expires {formatDate(iv.expires_at)}</span>;
}

export function InterviewTable({
  items,
  busyItemId,
  copiedItemId,
  error,
  demoNotice,
  isFiltered,
  onClearFilters,
  onGenerate,
  onReissue,
  onAssess,
  onCopyLink,
  onViewResume,
  getInterviewHref,
  sort,
  onSort,
  suggestedItemId = null,
}: {
  items: RunItemSummary[];
  busyItemId: string | null;
  copiedItemId: string | null;
  error: string | null;
  demoNotice: string | null;
  isFiltered: boolean;
  onClearFilters: () => void;
  onGenerate: (item: RunItemSummary) => void;
  onReissue: (item: RunItemSummary) => void;
  onAssess: (item: RunItemSummary) => void;
  onCopyLink: (item: RunItemSummary) => void;
  // Same handler the screening table uses, so a resume fetched on either tab
  // is already cached for the other. Takes the event to match that signature.
  onViewResume: (e: React.MouseEvent, item: RunItemSummary) => void;
  getInterviewHref: (item: RunItemSummary) => string | null;
  sort: InterviewSort;
  onSort: (column: InterviewSortColumn) => void;
  // The row whose "Set up" is the tab's primary action. The page sets it
  // only while the run has no interviews at all, so green appears on at most
  // one button.
  suggestedItemId?: string | null;
}) {
  /** Where clicking the row goes: the same place its link action does, so
   *  only rows that already offer one (review, view, findings) are
   *  clickable. A sent-but-unstarted invite has nothing to look at yet. */
  function rowHref(item: RunItemSummary): string | null {
    const iv = item.interview;
    const href = getInterviewHref(item);
    if (!iv || !href) return null;
    if (iv.status === "draft") return `${href}/review`;
    if (iv.status === "created") return null;
    if (iv.status === "expired" && !iv.answered) return null;
    return href;
  }

  function renderActions(item: RunItemSummary) {
    const iv = item.interview;
    const isBusy = busyItemId === item.item_id;
    // Any row action spends an LLM call, so they run one at a time.
    const otherBusy = busyItemId !== null && !isBusy;
    const href = getInterviewHref(item);
    const spinner = <Loader2 className="w-3.5 h-3.5 animate-spin" />;

    // Labels stay short so the cell doesn't dominate the row; the fuller
    // wording used by InterviewSection rides along as the tooltip.
    const viewLink = (label: string, title?: string) =>
      href ? (
        <Link
          href={href}
          title={title}
          className="relative z-10 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {label}
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      ) : null;

    const actionButton = (
      label: string,
      icon: React.ReactNode,
      onClick: () => void,
      destructive = false,
      title?: string,
      primary = false
    ) => (
      <Button
        size="sm"
        variant={primary ? "default" : "outline"}
        onClick={onClick}
        disabled={isBusy || otherBusy}
        title={title}
        className={cn(
          "relative z-10 gap-1.5 font-semibold cursor-pointer",
          destructive && "text-error-foreground border-error-edge"
        )}
      >
        {isBusy ? spinner : icon}
        {label}
      </Button>
    );

    // Icon-only so a row's labelled action stays the one that reads first,
    // and two labelled buttons don't push the table past the screen.
    const copied = copiedItemId === item.item_id;
    const copyButton = (
      <Button
        size="icon"
        variant="outline"
        onClick={() => onCopyLink(item)}
        title={copied ? "Copied" : "Copy invite link"}
        aria-label={copied ? "Copied" : "Copy invite link"}
        className="relative z-10 h-8 w-8 shrink-0 cursor-pointer"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-success-foreground" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </Button>
    );

    // Failed evaluations have no candidate to interview against.
    if (!item.candidate_id) return <span className="text-muted-foreground">—</span>;

    if (!iv) {
      return actionButton(
        "Set up",
        <Sparkles className="w-3.5 h-3.5" />,
        () => onGenerate(item),
        false,
        "Choose what to ask, then review the questions before sending",
        item.item_id === suggestedItemId
      );
    }

    switch (iv.status) {
      // Generated but not approved: there is no link to copy, and the only
      // move is finishing the review. Derived from the transcript href rather
      // than taking another prop, so both flavors stay on one route shape.
      case "draft":
        return (
          <div className="flex items-center justify-end gap-2">
            {href ? (
              <Link
                href={`${href}/review`}
                title="Review the questions before sending this interview"
                className="relative z-10 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Review
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            ) : null}
          </div>
        );
      case "created":
        return (
          <div className="flex items-center justify-end gap-2">
            {copyButton}
            {actionButton(
              "Reissue",
              <RotateCcw className="w-3.5 h-3.5" />,
              () => onReissue(item),
              false,
              "Invalidate this link and issue a fresh one"
            )}
          </div>
        );
      case "in_progress":
        return (
          <div className="flex items-center justify-end gap-2">
            {copyButton}
            {viewLink("View")}
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center justify-end gap-2">
            {iv.has_assessment_error
              ? actionButton(
                  "Retry",
                  <RotateCcw className="w-3.5 h-3.5" />,
                  () => onAssess(item),
                  true,
                  assessmentCopy.retry
                )
              : actionButton(
                  "Assess",
                  <Sparkles className="w-3.5 h-3.5" />,
                  () => onAssess(item),
                  false,
                  assessmentCopy.assessNow
                )}
            {viewLink("View")}
          </div>
        );
      case "assessed":
        return (
          <div className="flex items-center justify-end gap-2">
            {viewLink("View", assessmentCopy.viewFindings)}
          </div>
        );
      case "expired":
        return (
          <div className="flex items-center justify-end gap-2">
            {iv.answered
              ? actionButton(
                  "Assess",
                  <Sparkles className="w-3.5 h-3.5" />,
                  () => onAssess(item),
                  false,
                  assessmentCopy.assessPartial
                )
              : actionButton(
                  "Reissue",
                  <RotateCcw className="w-3.5 h-3.5" />,
                  () => onReissue(item),
                  false,
                  "Invalidate this link and issue a fresh one"
                )}
            {iv.answered && viewLink("View")}
          </div>
        );
      default:
        return <span className="text-muted-foreground">—</span>;
    }
  }

  return (
    <div className="space-y-3">
      {demoNotice && <DemoNotice>{demoNotice}</DemoNotice>}

      {error && (
        <div className="bg-error border border-error-edge text-error-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
          <X className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-foreground/[0.06] hover:bg-foreground/[0.06] border-b-2 border-foreground/15">
              <TableHead className="font-semibold">
                <SortHeader
                  column="candidate"
                  label="Candidate"
                  sort={sort}
                  onSort={onSort}
                />
              </TableHead>
              {/* Qualified: every other column here is about the interview,
                  so a bare "Score" reads as the interview's. */}
              <TableHead className="w-32 text-center font-semibold">
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* noTitle: this column explains itself through the Radix
                        tooltip below, so it must not also carry a native one. */}
                    <SortHeader
                      column="score"
                      label="Resume score"
                      sort={sort}
                      onSort={onSort}
                      className="justify-center"
                      noTitle
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Score from resume screening, not from the interview.</p>
                    {sort.column === null && (
                      <p className="text-muted-foreground">
                        Rows are in this order by default.
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="w-36 text-center font-semibold">
                <SortHeader
                  column="status"
                  label="Interview"
                  sort={sort}
                  onSort={onSort}
                  className="justify-center"
                />
              </TableHead>
              <TableHead className="w-36 text-center font-semibold">
                <SortHeader
                  column="recommendation"
                  label="Recommendation"
                  sort={sort}
                  onSort={onSort}
                  className="justify-center"
                />
              </TableHead>
              <TableHead className="font-semibold">
                <SortHeader
                  column="date"
                  label="Date"
                  sort={sort}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-right pr-4 font-semibold">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-foreground/10">
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <p className="text-muted-foreground font-medium text-sm">
                    {isFiltered
                      ? "No candidates match your filters."
                      : "No candidates in this run yet."}
                  </p>
                  {isFiltered && (
                    <button
                      onClick={onClearFilters}
                      className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
                    >
                      Clear filters
                    </button>
                  )}
                </TableCell>
              </TableRow>
            )}

            {items.map((item) => {
              const iv = item.interview;
              const scorePct =
                item.final_score != null ? Math.round(item.final_score * 100) : null;
              const isFailed = item.status === "failed";
              const href = rowHref(item);
              const name = item.candidate_name ?? item.filename;

              return (
                <TableRow
                  key={item.item_id}
                  className={cn(
                    "relative",
                    href
                      ? "hover:bg-foreground/[0.04] focus-within:bg-foreground/[0.04]"
                      : "hover:bg-transparent",
                    isFailed && "opacity-60"
                  )}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {/* The resume lives on the Screening tab, but reading it
                          next to an interview verdict is the common move. */}
                      {!isFailed && item.candidate_id ? (
                        <button
                          onClick={(e) => onViewResume(e, item)}
                          title="View resume"
                          className="relative z-10 p-1 -m-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                      ) : (
                        <FileText
                          className={cn(
                            "w-5 h-5 shrink-0",
                            isFailed ? "text-error-border" : "text-muted-foreground"
                          )}
                        />
                      )}
                      <div className="min-w-0">
                        {href ? (
                          <Link
                            href={href}
                            className="font-medium truncate outline-none after:absolute after:inset-0 focus-visible:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          <span className="font-medium truncate">{name}</span>
                        )}
                        {item.candidate_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {item.filename}
                          </p>
                        )}
                        {isFailed && (
                          <p className="text-xs text-error-foreground font-medium mt-0.5">
                            Evaluation failed
                          </p>
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
                          className={cn("h-1 w-14 bg-muted", scoreBarColor(item.final_score!))}
                        />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    {iv ? (
                      <Badge
                        variant="outline"
                        className={interviewStatusStyles[iv.status] ?? ""}
                      >
                        {interviewStatusLabels[iv.status] ?? iv.status}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-muted text-muted-foreground border-border"
                      >
                        Not sent
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    {iv?.recommendation ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-bold",
                          recommendationStyles[iv.recommendation] ?? ""
                        )}
                      >
                        {recommendationLabels[iv.recommendation] ?? iv.recommendation}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    <InterviewDate item={item} />
                  </TableCell>

                  <TableCell className="text-right pr-4 whitespace-nowrap">
                    {renderActions(item)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
