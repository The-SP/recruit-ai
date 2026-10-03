"use client";

import {
  ArrowLeft,
  Download,
  Ellipsis,
  Link2,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CandidateCompareDialog } from "@/components/candidate-compare-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { CompareBar } from "@/components/evaluation/compare-bar";
import { FilterControls } from "@/components/evaluation/filter-controls";
import { InterviewStatsStrip } from "@/components/evaluation/interview-stats-strip";
import { JobDescriptionSheet } from "@/components/evaluation/job-description-sheet";
import {
  InterviewTable,
  firstSortDir,
  interviewSortDate,
  type InterviewSort,
  type InterviewSortColumn,
} from "@/components/evaluation/interview-table";
import { ProcessingProgress } from "@/components/evaluation/processing-progress";
import { ResultsTable } from "@/components/evaluation/results-table";
import { ResumeSheet } from "@/components/evaluation/resume-sheet";
import { StatsSummary } from "@/components/evaluation/stats-summary";
import { ResumeFileUpload } from "@/components/resume-file-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  candidateDeleteDescription,
  runDeleteDescription,
} from "@/lib/delete-copy";
import { interviewStatusLabels, recommendationLabels } from "@/lib/evaluation-styles";
import { MAX_COMPARE, type ResumePanelState, type SortBy } from "@/lib/evaluation-types";
import type { CachedInterview } from "@/lib/interview-types";
import { useInviteActions } from "@/lib/use-invite-actions";
import { ApiError } from "@/services/api";
import { type CandidateBreakdown } from "@/services/batch";
import {
  addCandidatesToRun,
  assessRunCandidateInterview,
  deleteEvaluationRun,
  deleteRunItem,
  getEvaluationRun,
  getEvaluationJobDescription,
  getRunCandidateBreakdown,
  getRunCandidateInterview,
  reissueRunCandidateInterview,
  retryFailedRun,
  type EvaluationRunDetail,
  type RunItemSummary,
} from "@/services/runs";

/** Ranks interview states by how far along the funnel they are, so sorting
 *  the Interview column walks the workflow rather than the alphabet. */
const INTERVIEW_STATUS_ORDER: Record<string, number> = {
  assessed: 6,
  completed: 5,
  in_progress: 4,
  created: 3,
  // Earliest real stage: generated, but waiting on a human before it can be
  // sent. Ranked above `expired`, which is where an invite ends up.
  draft: 2,
  expired: 1,
};

/** The real statuses, listed the way a recruiter walks the funnel (invite out
 *  first, expired last) rather than by rank. Adding a status to
 *  INTERVIEW_STATUS_ORDER and interviewStatusLabels is all it takes to make it
 *  sortable and badge-able; adding it here also makes it filterable. */
const INTERVIEW_STATUS_FILTER_VALUES = [
  "draft",
  "created",
  "in_progress",
  "completed",
  "assessed",
  "expired",
];

/** Strongest recommendation first. */
const RECOMMENDATION_ORDER: Record<string, number> = {
  advance: 3,
  borderline: 2,
  do_not_advance: 1,
};

/** Interview-state filter for the Interviews tab, replacing the hire-signal
 *  options FilterControls shows on Screening. Status labels are read from
 *  interviewStatusLabels rather than restated, so the dropdown can't drift
 *  from the badge the table renders in the same row. `all` and `not_sent` are
 *  filter-only: neither is a real interview status. */
const INTERVIEW_FILTER_OPTIONS = [
  { value: "all", label: "All Interviews" },
  { value: "not_sent", label: "Not Sent" },
  ...INTERVIEW_STATUS_FILTER_VALUES.map((value) => ({
    value,
    label: interviewStatusLabels[value],
  })),
];

function RunDetailPageInner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: runId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Derived from the URL rather than mirrored into state, so deep links and
  // browser back/forward work with no sync effect. Anything unrecognised
  // falls back to the screening view.
  const tab = searchParams.get("tab") === "interviews" ? "interviews" : "screening";
  const setTab = useCallback(
    (value: string) => {
      // replace, not push: toggling tabs shouldn't stack history entries
      // between the user and the back-to-dashboard link.
      router.replace(
        `/evaluation/${runId}${value === "interviews" ? "?tab=interviews" : ""}`,
        { scroll: false }
      );
    },
    [router, runId]
  );

  const [data, setData] = useState<EvaluationRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [breakdownCache, setBreakdownCache] = useState<
    Record<string, CandidateBreakdown | "loading" | "error">
  >({});
  const [interviewCache, setInterviewCache] = useState<
    Record<string, CachedInterview>
  >({});
  const [retryingAll, setRetryingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSignal, setFilterSignal] = useState("all");
  const [interviewSearch, setInterviewSearch] = useState("");
  const [interviewFilter, setInterviewFilter] = useState("all");
  // Each column toggles its own direction, rather than the single cycling
  // header the screening table uses: this table has more axes worth sorting,
  // and a cycle that silently lands on another column reads as a bug.
  const [interviewSort, setInterviewSort] = useState<InterviewSort>({
    column: null,
    dir: "desc",
  });
  const [sortBy, setSortBy] = useState<SortBy>("score_desc");
  const [resumePanel, setResumePanel] = useState<ResumePanelState | null>(null);
  const [compareItemIds, setCompareItemIds] = useState<Set<string>>(new Set());
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addFilesError, setAddFilesError] = useState<string | null>(null);
  const [deleteRunOpen, setDeleteRunOpen] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] =
    useState<RunItemSummary | null>(null);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [jobDescription, setJobDescription] = useState<string | null>(null);
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keys already fetched or in flight. Kept in a ref so the ensure* callbacks
  // don't depend on the cache state: depending on it gives them a new identity
  // on every cache write, which re-renders the whole results table.
  const requestedBreakdowns = useRef<Set<string>>(new Set());
  const requestedInterviews = useRef<Set<string>>(new Set());

  // `loading` starts true, so the mount fetch has nothing to set before the
  // request; only refreshes flag themselves up front.
  const loadRun = useCallback(
    () =>
      getEvaluationRun(runId)
        .then((run) => {
          setData(run);
          setError(null);
        })
        .catch((err) => {
          setError(err instanceof ApiError ? err.message : "Failed to load run.");
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        }),
    [runId]
  );

  const fetchData = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      return loadRun();
    },
    [loadRun]
  );

  useEffect(() => {
    loadRun();
  }, [loadRun]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (data && (data.status === "pending" || data.status === "processing")) {
      pollRef.current = setInterval(() => fetchData(true), 10000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [data, fetchData]);

  const ensureBreakdown = useCallback(async (item: RunItemSummary) => {
    const id = item.item_id;
    if (!item.candidate_id || requestedBreakdowns.current.has(id)) return;
    requestedBreakdowns.current.add(id);
    setBreakdownCache((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const bd = await getRunCandidateBreakdown(runId, item.candidate_id);
      setBreakdownCache((prev) => ({ ...prev, [id]: bd }));
    } catch {
      setBreakdownCache((prev) => ({ ...prev, [id]: "error" }));
    }
  }, [runId]);

  const ensureInterview = useCallback(async (item: RunItemSummary) => {
    const id = item.item_id;
    if (!item.candidate_id || requestedInterviews.current.has(id)) return;
    requestedInterviews.current.add(id);
    setInterviewCache((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const detail = await getRunCandidateInterview(runId, item.candidate_id);
      setInterviewCache((prev) => ({ ...prev, [id]: detail }));
    } catch {
      setInterviewCache((prev) => ({ ...prev, [id]: "error" }));
    }
  }, [runId]);

  const runInterviewAction = useCallback(
    async (item: RunItemSummary, action: (candidateId: string) => Promise<unknown>) => {
      if (!item.candidate_id) return;
      const candidateId = item.candidate_id;
      try {
        await action(candidateId);
      } finally {
        // Refetch rather than guess, on success and failure alike. The two
        // reads are independent — the detail feeds the expanded row's panel,
        // the run feeds the Interviews tab, which renders from
        // run.items[].interview and would otherwise still read "Not sent" for
        // a freshly generated invite — so they run concurrently rather than
        // making the user wait for both in series. fetchData is silent, so
        // there's no layout flash.
        await Promise.all([
          getRunCandidateInterview(runId, candidateId).then((detail) =>
            setInterviewCache((prev) => ({ ...prev, [item.item_id]: detail }))
          ),
          fetchData(true),
        ]);
      }
    },
    [runId, fetchData]
  );

  // Navigates rather than generating in place: questions now go through a
  // human review step before any invite exists, and the ~20s generation
  // belongs on the page built to wait for it. The review page issues the
  // create call itself, which is idempotent, so landing there twice never
  // drafts a second interview.
  const handleGenerateInterview = useCallback(
    async (item: RunItemSummary) => {
      if (!item.candidate_id) return;
      router.push(
        `/evaluation/${runId}/candidate/${item.candidate_id}/interview/review`
      );
    },
    [runId, router]
  );

  const handleReissueInterview = useCallback(async (item: RunItemSummary) => {
    await runInterviewAction(item, (candidateId) =>
      reissueRunCandidateInterview(runId, candidateId)
    );
  }, [runId, runInterviewAction]);

  const handleAssessInterview = useCallback(async (item: RunItemSummary) => {
    await runInterviewAction(item, (candidateId) =>
      assessRunCandidateInterview(runId, candidateId)
    );
  }, [runId, runInterviewAction]);

  // The Interviews tab drives the same three handlers as the expanded row,
  // wrapped so the table can show which row is in flight.
  const {
    busyKey: busyItemId,
    copiedKey: copiedItemId,
    error: rowActionError,
    demoNotice: rowActionNotice,
    runAction: runRowAction,
    copyInviteUrl: copyRowInviteUrl,
  } = useInviteActions();

  const handleRowGenerate = useCallback(
    (item: RunItemSummary) =>
      runRowAction(() => handleGenerateInterview(item), item.item_id),
    [runRowAction, handleGenerateInterview]
  );

  const handleRowReissue = useCallback(
    (item: RunItemSummary) =>
      runRowAction(() => handleReissueInterview(item), item.item_id),
    [runRowAction, handleReissueInterview]
  );

  const handleRowAssess = useCallback(
    (item: RunItemSummary) =>
      runRowAction(() => handleAssessInterview(item), item.item_id),
    [runRowAction, handleAssessInterview]
  );

  const handleRowCopyLink = useCallback(
    (item: RunItemSummary) => {
      if (!item.interview) return;
      copyRowInviteUrl(item.interview.invite_url, item.item_id);
    },
    [copyRowInviteUrl]
  );

  const handleRowClick = useCallback((item: RunItemSummary) => {
    const id = item.item_id;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      next.add(id);
      return next;
    });
    ensureBreakdown(item);
    ensureInterview(item);
  }, [ensureBreakdown, ensureInterview]);

  const handleViewResume = async (e: React.MouseEvent, item: RunItemSummary) => {
    e.stopPropagation();
    if (!item.candidate_id) return;
    const cached = breakdownCache[item.item_id];
    if (cached && cached !== "loading" && cached !== "error" && cached.resume_markdown) {
      setResumePanel({ name: item.candidate_name ?? null, filename: item.filename, markdown: cached.resume_markdown });
      return;
    }
    requestedBreakdowns.current.add(item.item_id);
    setBreakdownCache(prev => ({ ...prev, [item.item_id]: "loading" }));
    try {
      const bd = await getRunCandidateBreakdown(runId, item.candidate_id);
      setBreakdownCache(prev => ({ ...prev, [item.item_id]: bd }));
      setResumePanel({ name: item.candidate_name ?? null, filename: item.filename, markdown: bd.resume_markdown ?? "" });
    } catch {
      setBreakdownCache(prev => ({ ...prev, [item.item_id]: "error" }));
    }
  };

  const handleOpenDescription = async () => {
    setIsDescriptionOpen(true);
    if (jobDescription) return;
    setDescriptionLoading(true);
    setDescriptionError(null);
    try {
      const description = await getEvaluationJobDescription(runId);
      setJobDescription(description.raw_text);
    } catch (err) {
      setDescriptionError(
        err instanceof ApiError ? err.message : "Failed to load job description."
      );
    } finally {
      setDescriptionLoading(false);
    }
  };

  async function handleRetryAll() {
    if (!data) return;
    setRetryingAll(true);
    try {
      await retryFailedRun(runId);
      await fetchData(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to retry");
    } finally {
      setRetryingAll(false);
    }
  }

  async function handleAddCandidates() {
    if (addFiles.length === 0) { setAddFilesError("Upload at least one PDF."); return; }
    setAddFilesError(null);
    setAddError(null);
    setAddSubmitting(true);
    try {
      await addCandidatesToRun(runId, addFiles);
      setAddFiles([]);
      setAddOpen(false);
      await fetchData(true);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleDeleteRun() {
    await deleteEvaluationRun(runId);
    // The page being viewed no longer exists.
    router.push("/history");
  }

  async function handleDeleteCandidate(item: RunItemSummary) {
    const id = item.item_id;
    await deleteRunItem(runId, id);

    // Every per-item cache is keyed by item_id, and a stale entry would attach
    // itself to whichever candidate is added next. The two refs matter most:
    // they gate refetching, so a leftover key silently blocks the new row from
    // ever loading its breakdown.
    requestedBreakdowns.current.delete(id);
    requestedInterviews.current.delete(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setCompareItemIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      if (next.size < 2) setIsCompareOpen(false);
      return next;
    });
    setBreakdownCache((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setInterviewCache((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setResumePanel((prev) =>
      prev && prev.filename === item.filename ? null : prev
    );

    // Resyncs total_count and every value derived from the item list.
    await fetchData(true);
  }

  function exportCsv() {
    if (!data) return;
    const headers = [
      "Rank",
      "Name",
      "File",
      "Score (%)",
      "Hire Signal",
      "Status",
      "Interview Status",
      "Interview Recommendation",
    ];
    const rows = data.items.map((item, i) => [
      i + 1,
      item.candidate_name ?? item.filename,
      item.filename,
      item.final_score != null ? (item.final_score * 100).toFixed(1) : "N/A",
      item.hire_signal ?? "N/A",
      item.status,
      item.interview ? (interviewStatusLabels[item.interview.status] ?? item.interview.status) : "Not sent",
      item.interview?.recommendation
        ? (recommendationLabels[item.interview.recommendation] ?? item.interview.recommendation)
        : "N/A",
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(data.job_title ?? "results").replace(/\s+/g, "-").toLowerCase()}-candidates.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  const isActive = data?.status === "pending" || data?.status === "processing";
  const failedCount = data?.failed_count ?? 0;
  const progressPercent = data
    ? Math.round((data.processed_count / Math.max(data.total_count, 1)) * 100)
    : 0;

  const completedItems = useMemo(
    () => (data?.items ?? []).filter(i => i.final_score != null),
    [data?.items]
  );
  const bestScore = completedItems.length > 0
    ? Math.round(Math.max(...completedItems.map(i => i.final_score!)) * 100)
    : null;
  const topMatchCount = (data?.items ?? []).filter(
    i => i.hire_signal === "strong_match" || i.hire_signal === "good_match"
  ).length;

  // "Awaiting" is `created` only: a candidate mid-interview has responded.
  // Overdue invites are expired server-side on load, so they don't inflate it.
  // Only scored candidates can be interviewed: question generation is
  // grounded in the evaluation, so a row that hasn't finished scoring has
  // nothing to offer but a button that would fail. Mirrors how sourceItems
  // hides unscored rows from the screening table while a run is active.
  const interviewableItems = useMemo(
    () => (data?.items ?? []).filter(i => i.candidate_id && i.final_score != null),
    [data?.items]
  );

  // One pass rather than three filters: this recomputes on every poll tick
  // while a run is active, and the result is four integers.
  const interviewStats = useMemo(() => {
    // Counted by status rather than with a running total per tile: a draft has
    // no invite link, so "Invited" must exclude it. Bucketing first means the
    // next status is a display decision here, not an off-by-one in the strip.
    const byStatus: Record<string, number> = {};
    for (const i of interviewableItems) {
      if (!i.interview) continue;
      byStatus[i.interview.status] = (byStatus[i.interview.status] ?? 0) + 1;
    }
    const count = (...statuses: string[]) =>
      statuses.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
    return {
      total: interviewableItems.length,
      invited: count("created", "in_progress", "completed", "assessed", "expired"),
      awaiting: count("created"),
      assessed: count("assessed"),
    };
  }, [interviewableItems]);

  // Kept separate from the screening filters: the two tabs filter on
  // different axes, and carrying a hire-signal filter across would silently
  // hide rows on a tab that never showed that control.
  const interviewFiltered = useMemo(() => {
    const q = interviewSearch.toLowerCase();
    return interviewableItems.filter(i => {
      if (
        q &&
        !i.candidate_name?.toLowerCase().includes(q) &&
        !i.filename.toLowerCase().includes(q)
      )
        return false;
      if (interviewFilter === "all") return true;
      if (interviewFilter === "not_sent") return !i.interview;
      return i.interview?.status === interviewFilter;
    })
    .sort((a, b) => {
      const { column, dir } = interviewSort;
      const flip = dir === "asc" ? -1 : 1;
      // Unsorted: the same best-score-first order the screening tab defaults
      // to, so clearing a sort lands somewhere familiar rather than arbitrary.
      if (column === null) return (b.final_score ?? -1) - (a.final_score ?? -1);
      if (column === "candidate") {
        const na = a.candidate_name ?? a.filename;
        const nb = b.candidate_name ?? b.filename;
        // Names read most naturally A-Z, so "asc" is the un-flipped case.
        return na.localeCompare(nb) * -flip;
      }
      if (column === "score") {
        return ((b.final_score ?? -1) - (a.final_score ?? -1)) * flip;
      }
      if (column === "status") {
        // No interview sorts below every real state.
        const sa = a.interview ? INTERVIEW_STATUS_ORDER[a.interview.status] ?? 0 : 0;
        const sb = b.interview ? INTERVIEW_STATUS_ORDER[b.interview.status] ?? 0 : 0;
        return (sb - sa) * flip;
      }
      if (column === "recommendation") {
        const ra = RECOMMENDATION_ORDER[a.interview?.recommendation ?? ""] ?? 0;
        const rb = RECOMMENDATION_ORDER[b.interview?.recommendation ?? ""] ?? 0;
        return (rb - ra) * flip;
      }
      // date: most recent activity first, undated rows last.
      const da = interviewSortDate(a);
      const db = interviewSortDate(b);
      return (db - da) * flip;
    });
  }, [interviewableItems, interviewSearch, interviewFilter, interviewSort]);

  const isInterviewFiltered = interviewSearch !== "" || interviewFilter !== "all";

  // Three-state cycle so a sort can be undone: first click sorts in the
  // direction firstSortDir picks, the second reverses it, the third clears
  // back to the default order.
  const handleInterviewSort = useCallback((column: InterviewSortColumn) => {
    const firstDir = firstSortDir(column);
    setInterviewSort(prev => {
      if (prev.column !== column) return { column, dir: firstDir };
      if (prev.dir === firstDir)
        return { column, dir: firstDir === "asc" ? "desc" : "asc" };
      return { column: null, dir: "desc" };
    });
  }, []);

  const sourceItems = useMemo(
    () => (isActive ? completedItems : (data?.items ?? [])),
    [isActive, completedItems, data?.items]
  );

  const filteredItems = useMemo(() =>
    sourceItems
      .filter((i) => {
        const q = searchQuery.toLowerCase();
        if (q && !i.candidate_name?.toLowerCase().includes(q) && !i.filename.toLowerCase().includes(q)) return false;
        if (filterSignal !== "all" && i.hire_signal !== filterSignal) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "score_desc") return (b.final_score ?? -1) - (a.final_score ?? -1);
        const na = a.candidate_name ?? a.filename;
        const nb = b.candidate_name ?? b.filename;
        return sortBy === "name_asc" ? na.localeCompare(nb) : nb.localeCompare(na);
      }),
    [sourceItems, searchQuery, filterSignal, sortBy]
  );

  const isFiltered = searchQuery !== "" || filterSignal !== "all";

  const compareItems = useMemo(
    () =>
      sourceItems.filter(
        (i): i is RunItemSummary & { candidate_id: string } =>
          i.candidate_id !== null && compareItemIds.has(i.item_id)
      ),
    [sourceItems, compareItemIds]
  );

  // The compare dialog looks up breakdowns by candidate_id; this page's cache
  // is keyed by item_id, so re-key the selected entries.
  const compareBreakdowns = useMemo(() => {
    const rec: Record<string, CandidateBreakdown | "loading" | "error"> = {};
    for (const item of compareItems) {
      const bd = breakdownCache[item.item_id];
      if (bd) rec[item.candidate_id] = bd;
    }
    return rec;
  }, [compareItems, breakdownCache]);

  const toggleCompare = (itemId: string) => {
    setCompareItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else if (next.size < MAX_COMPARE) {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleOpenCompare = () => {
    compareItems.forEach(item => ensureBreakdown(item));
    setIsCompareOpen(true);
  };

  const handleRemoveFromCompare = (candidateId: string) => {
    const item = compareItems.find(i => i.candidate_id === candidateId);
    if (!item) return;
    setCompareItemIds(prev => {
      const next = new Set(prev);
      next.delete(item.item_id);
      if (next.size < 2) setIsCompareOpen(false);
      return next;
    });
  };

  const expandableIds = filteredItems.map(i => i.item_id);
  const allExpanded = expandableIds.length > 0 && expandableIds.every(id => expandedIds.has(id));
  function handleExpandAll() {
    if (allExpanded) { setExpandedIds(new Set()); return; }
    setExpandedIds(new Set(expandableIds));
    expandableIds.forEach(id => {
      const item = filteredItems.find(i => i.item_id === id);
      if (item && !breakdownCache[id]) handleRowClick(item);
    });
  }

  if (loading) {
    return (
      <main className="px-6 py-24 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-primary/10 animate-pulse" />
          <Loader2 className="absolute top-0 left-0 w-16 h-16 animate-spin text-primary border-4 border-transparent border-t-primary rounded-full" />
        </div>
        <p className="mt-6 text-foreground font-bold text-lg">Fetching your results...</p>
        <p className="text-muted-foreground text-sm mt-1">This will only take a moment</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="px-6 py-12 max-w-5xl mx-auto">
        <Card className="p-8 text-center border-destructive/30 bg-destructive/5 text-destructive">
          <p className="font-semibold">{error}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back to Dashboard
            </Link>
          </Button>
        </Card>
      </main>
    );
  }

  if (!data) return null;

  const jobTitle = data.job_title ?? "AI Evaluation Results";

  return (
    <>
      <main className="px-6 py-12 max-w-5xl mx-auto min-h-[calc(100vh-80px)]">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-8 border-b border-border">
          <div className="space-y-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
                {jobTitle}
              </h1>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-bold px-3 py-1 rounded-lg">
                {isActive ? "Processing" : "Completed"}
              </Badge>
            </div>
            {data.company_name && data.company_name !== "null" && (
              <p className="text-sm text-muted-foreground">{data.company_name}</p>
            )}
            <button
              type="button"
              onClick={handleOpenDescription}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary cursor-pointer"
            >
              <Link2 className="w-4 h-4" />
              View Job Description
            </button>
          </div>

          <div className="flex items-center self-start md:self-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Evaluation actions"
                  className="w-10 h-10 border-border text-muted-foreground hover:bg-muted cursor-pointer"
                >
                  <Ellipsis className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!isActive && failedCount > 0 && (
                  <DropdownMenuItem onSelect={handleRetryAll} disabled={retryingAll}>
                    {retryingAll ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                    Retry Failed ({failedCount})
                  </DropdownMenuItem>
                )}
                {!isActive && data.items.length > 0 && (
                  <DropdownMenuItem onSelect={exportCsv}>
                    <Download />
                    Export CSV
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => fetchData(true)} disabled={refreshing}>
                  <RefreshCw className={refreshing ? "animate-spin" : undefined} />
                  Refresh
                </DropdownMenuItem>
                {/* Hidden while the run is in flight: the backend refuses to delete
                    a pending or processing run, so offering it would only 400. */}
                {!isActive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setDeleteRunOpen(true)}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 />
                      Delete Evaluation
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tabs lead: each view brings its own stats, so the strip below
            belongs to the active tab rather than the page. */}
        <Tabs value={tab} onValueChange={setTab} className="gap-0">
          <TabsList className="mb-8">
            <TabsTrigger value="screening">Screening</TabsTrigger>
            <TabsTrigger value="interviews">Interviews</TabsTrigger>
          </TabsList>

          <TabsContent value="screening" className="space-y-8">
          <StatsSummary
            candidateCount={data.total_count}
            processingTimeSeconds={data.processing_time_seconds}
            bestScore={bestScore}
            topMatchCount={topMatchCount}
            isProcessing={isActive}
          />

          {/* Progress Card */}
          {isActive && (
            <ProcessingProgress
              processed={data.processed_count}
              total={data.total_count}
              failed={failedCount}
              percent={progressPercent}
            />
          )}

          {/* Search / filter controls. Gated on the same condition as the
              table below: while a run is still scoring its first results
              there is nothing to filter, and the controls would sit above
              an absent table. */}
          {data.items.length > 0 && (!isActive || completedItems.length > 0) && (
            <FilterControls
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filterSignal={filterSignal}
              onFilterChange={setFilterSignal}
              isFiltered={isFiltered}
              shownCount={filteredItems.length}
              totalCount={sourceItems.length}
            />
          )}

          {(!isActive || completedItems.length > 0) && (
            <>
              {isActive && (
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  <Sparkles className="w-3.5 h-3.5 text-success-foreground" />
                  Results So Far
                </div>
              )}

              {!isActive && data.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                    <Users className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-foreground font-bold text-lg">No candidates yet</p>
                  <p className="text-muted-foreground text-sm mt-1">Add resumes below to start evaluating candidates.</p>
                </div>
              ) : (
                <ResultsTable
                  items={filteredItems}
                  pendingItems={data.items.filter(i => i.final_score === null)}
                  expandedIds={expandedIds}
                  breakdownCache={breakdownCache}
                  compareIds={compareItemIds}
                  sortBy={sortBy}
                  onSort={() => setSortBy(prev => prev === "name_asc" ? "name_desc" : prev === "name_desc" ? "score_desc" : "name_asc")}
                  onRowClick={handleRowClick}
                  onToggleCompare={toggleCompare}
                  onViewResume={handleViewResume}
                  allExpanded={allExpanded}
                  onExpandAll={handleExpandAll}
                  isProcessing={isActive}
                  isFiltered={isFiltered}
                  showEmptyFilterRow={filteredItems.length === 0}
                  onClearFilters={() => { setSearchQuery(""); setFilterSignal("all"); }}
                  getCompareId={(item) => item.item_id}
                  getBreakdownKey={(item) => item.item_id}
                  interviewCache={interviewCache}
                  onGenerateInterview={handleGenerateInterview}
                  onReissueInterview={handleReissueInterview}
                  onAssessInterview={handleAssessInterview}
                  getInterviewHref={(item) =>
                    item.candidate_id
                      ? `/evaluation/${runId}/candidate/${item.candidate_id}/interview`
                      : null
                  }
                  // Withheld while processing (the backend refuses it) and on
                  // the last remaining row, where deleting the run is the
                  // right action instead.
                  onDeleteCandidate={
                    !isActive && data.items.length > 1
                      ? setPendingDeleteItem
                      : undefined
                  }
                />
              )}
            </>
          )}
          </TabsContent>

          <TabsContent value="interviews" className="space-y-8">
            <InterviewStatsStrip {...interviewStats} />

            {/* Run-level settings get a run-level entry point, rather than
                being reachable only inside one candidate's review page. */}
            <div className="flex justify-end -mt-4">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-10 px-4 border-border text-muted-foreground hover:bg-muted font-semibold gap-2 cursor-pointer"
              >
                <Link href={`/evaluation/${runId}/interview-template`}>
                  <Settings2 className="w-4 h-4" />
                  Interview template
                </Link>
              </Button>
            </div>

            {interviewableItems.length > 0 && (
              <FilterControls
                searchQuery={interviewSearch}
                onSearchChange={setInterviewSearch}
                filterSignal={interviewFilter}
                onFilterChange={setInterviewFilter}
                isFiltered={isInterviewFiltered}
                shownCount={interviewFiltered.length}
                totalCount={interviewableItems.length}
                filterOptions={INTERVIEW_FILTER_OPTIONS}
              />
            )}

            {interviewableItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  {isActive ? (
                    <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" />
                  ) : (
                    <MessageSquareText className="w-7 h-7 text-muted-foreground" />
                  )}
                </div>
                <p className="text-foreground font-bold text-lg">
                  {isActive ? "Scoring candidates…" : "No candidates to interview"}
                </p>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                  {isActive
                    ? "Interviews are generated from a candidate's evaluation, so they unlock as each resume finishes scoring."
                    : "Add resumes and let them finish scoring to start interviewing candidates."}
                </p>
              </div>
            ) : (
            <>
            {isActive && (
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5 text-success-foreground" />
                Scored So Far
              </div>
            )}
            <InterviewTable
              items={interviewFiltered}
              isFiltered={isInterviewFiltered}
              onClearFilters={() => {
                setInterviewSearch("");
                setInterviewFilter("all");
              }}
              busyItemId={busyItemId}
              copiedItemId={copiedItemId}
              error={rowActionError}
              demoNotice={rowActionNotice}
              onGenerate={handleRowGenerate}
              onReissue={handleRowReissue}
              onAssess={handleRowAssess}
              onCopyLink={handleRowCopyLink}
              onViewResume={handleViewResume}
              sort={interviewSort}
              onSort={handleInterviewSort}
              getInterviewHref={(item) =>
                item.candidate_id
                  ? `/evaluation/${runId}/candidate/${item.candidate_id}/interview`
                  : null
              }
            />
            </>
            )}
          </TabsContent>
        </Tabs>

        <div className="space-y-8">
          {/* Add more candidates */}
          <div className="space-y-6 pt-2">
            {!isActive && (
              <div className="space-y-3">
                {!addOpen ? (
                  <button
                    onClick={() => { setAddOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 text-base font-bold text-primary rounded-xl hover:bg-primary/10 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add More Candidates
                  </button>
                ) : (
                  <Card className="p-6 border-zinc-200 rounded-2xl shadow-sm space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-primary text-base">Add More Candidates</h3>
                      <button
                        onClick={() => { setAddOpen(false); setAddFiles([]); setAddError(null); setAddFilesError(null); }}
                        className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {addError && (
                      <div className="bg-error border border-error-edge text-error-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
                        <X className="w-4 h-4 shrink-0 mt-0.5" />
                        <p className="font-medium">{addError}</p>
                      </div>
                    )}

                    <ResumeFileUpload
                      files={addFiles}
                      onChange={(f) => { setAddFiles(f); setAddFilesError(null); }}
                      error={addFilesError}
                    />

                    <Button
                      onClick={handleAddCandidates}
                      disabled={addSubmitting || addFiles.length === 0}
                      className="w-full h-12 font-bold rounded-xl cursor-pointer"
                    >
                      {addSubmitting ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          Evaluate {addFiles.length > 0 ? `${addFiles.length} ` : ""}Candidate{addFiles.length !== 1 ? "s" : ""}
                          <Sparkles className="w-4 h-4" />
                        </span>
                      )}
                    </Button>
                  </Card>
                )}
              </div>
            )}

            <div className="flex justify-center pt-6 border-t border-border">
              <Link href="/dashboard/new">
                <Button variant="outline" className="gap-2 cursor-pointer">
                  New Evaluation
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Floating compare bar */}
        <CompareBar
          candidates={compareItems}
          getKey={(item) => item.item_id}
          onRemove={handleRemoveFromCompare}
          onClear={() => setCompareItemIds(new Set())}
          onOpen={handleOpenCompare}
        />
      </main>

      <CandidateCompareDialog
        open={isCompareOpen}
        onOpenChange={setIsCompareOpen}
        candidates={compareItems}
        breakdowns={compareBreakdowns}
        onRemove={handleRemoveFromCompare}
      />

      <JobDescriptionSheet
        open={isDescriptionOpen}
        onOpenChange={setIsDescriptionOpen}
        title={data.job_title}
        companyName={data.company_name}
        markdown={jobDescription}
        loading={descriptionLoading}
        error={descriptionError}
        onCopy={() => navigator.clipboard.writeText(jobDescription ?? "")}
      />

      <ResumeSheet panel={resumePanel} onClose={() => setResumePanel(null)} />

      <ConfirmDeleteDialog
        open={deleteRunOpen}
        onOpenChange={setDeleteRunOpen}
        title="Delete this evaluation run?"
        description={runDeleteDescription(data)}
        confirmLabel="Delete run"
        onConfirm={handleDeleteRun}
      />

      <ConfirmDeleteDialog
        open={pendingDeleteItem !== null}
        onOpenChange={(open) => !open && setPendingDeleteItem(null)}
        title="Remove this candidate?"
        description={
          pendingDeleteItem
            ? candidateDeleteDescription(pendingDeleteItem.candidate_name)
            : null
        }
        confirmLabel="Remove candidate"
        onConfirm={async () => {
          if (pendingDeleteItem) await handleDeleteCandidate(pendingDeleteItem);
        }}
      />
    </>
  );
}

// useSearchParams (the ?tab= state) needs a Suspense boundary, same as the
// anonymous results page and the candidate interview page.
export default function RunDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense>
      <RunDetailPageInner {...props} />
    </React.Suspense>
  );
}
