"use client";

import {
  ArrowLeft,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CandidateCompareDialog } from "@/components/candidate-compare-dialog";
import { CompareBar } from "@/components/evaluation/compare-bar";
import { FilterControls } from "@/components/evaluation/filter-controls";
import { ProcessingProgress } from "@/components/evaluation/processing-progress";
import { ResultsTable } from "@/components/evaluation/results-table";
import { ResumeSheet } from "@/components/evaluation/resume-sheet";
import { StatsSummary } from "@/components/evaluation/stats-summary";
import { ResumeFileUpload } from "@/components/resume-file-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MAX_COMPARE, type ResumePanelState, type SortBy } from "@/lib/evaluation-types";
import type { CachedInterview } from "@/lib/interview-types";
import { ApiError } from "@/services/api";
import { type CandidateBreakdown } from "@/services/batch";
import {
  addCandidatesToRun,
  createRunCandidateInterview,
  getEvaluationRun,
  getRunCandidateBreakdown,
  getRunCandidateInterview,
  reissueRunCandidateInterview,
  retryFailedRun,
  type EvaluationRunDetail,
  type RunItemSummary,
} from "@/services/runs";

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: runId } = use(params);

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
  const [sortBy, setSortBy] = useState<SortBy>("score_desc");
  const [resumePanel, setResumePanel] = useState<ResumePanelState | null>(null);
  const [compareItemIds, setCompareItemIds] = useState<Set<string>>(new Set());
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addFilesError, setAddFilesError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keys already fetched or in flight. Kept in a ref so the ensure* callbacks
  // don't depend on the cache state: depending on it gives them a new identity
  // on every cache write, which re-renders the whole results table.
  const requestedBreakdowns = useRef<Set<string>>(new Set());
  const requestedInterviews = useRef<Set<string>>(new Set());

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const run = await getEvaluationRun(runId);
        setData(run);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load run.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [runId]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        // Refetch rather than guess, on success and failure alike.
        const detail = await getRunCandidateInterview(runId, candidateId);
        setInterviewCache((prev) => ({ ...prev, [item.item_id]: detail }));
      }
    },
    [runId]
  );

  // Generation runs an LLM call (~20s). The cache slot is marked "loading"
  // for the duration so a panel remount can't drop the in-flight request and
  // leave a dead spinner; on failure the slot is refetched, not guessed.
  const handleGenerateInterview = useCallback(async (item: RunItemSummary) => {
    if (!item.candidate_id) return;
    setInterviewCache((prev) => ({ ...prev, [item.item_id]: "loading" }));
    await runInterviewAction(item, (candidateId) =>
      createRunCandidateInterview(runId, candidateId)
    );
  }, [runId, runInterviewAction]);

  const handleReissueInterview = useCallback(async (item: RunItemSummary) => {
    await runInterviewAction(item, (candidateId) =>
      reissueRunCandidateInterview(runId, candidateId)
    );
  }, [runId, runInterviewAction]);

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

  function exportCsv() {
    if (!data) return;
    const headers = ["Rank", "Name", "File", "Score (%)", "Hire Signal", "Status"];
    const rows = data.items.map((item, i) => [
      i + 1,
      item.candidate_name ?? item.filename,
      item.filename,
      item.final_score != null ? (item.final_score * 100).toFixed(1) : "N/A",
      item.hire_signal ?? "N/A",
      item.status,
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
            <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
              {jobTitle}
            </h1>
            {data.company_name && data.company_name !== "null" && (
              <p className="text-sm text-muted-foreground">{data.company_name}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Status</p>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-bold px-3 py-1 rounded-lg">
                {isActive ? "Processing" : "Completed"}
              </Badge>
            </div>
            {!isActive && failedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryAll}
                disabled={retryingAll}
                className="h-10 px-4 border-border text-muted-foreground hover:bg-muted font-semibold gap-2 cursor-pointer"
                title="Re-queue all failed candidates for evaluation"
              >
                {retryingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Retry Failed ({failedCount})
              </Button>
            )}
            {!isActive && data.items.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                className="h-10 px-4 border-border text-muted-foreground hover:bg-muted font-semibold gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="w-10 h-10 border-border text-muted-foreground hover:bg-muted transition-all active:rotate-180 duration-500 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Stats */}
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

        <div className="space-y-8">
          {/* Search / filter controls */}
          {data.items.length > 0 && (
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
                  getInterviewHref={(item) =>
                    item.candidate_id
                      ? `/evaluation/${runId}/candidate/${item.candidate_id}/interview`
                      : null
                  }
                />
              )}
            </>
          )}

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

      <ResumeSheet panel={resumePanel} onClose={() => setResumePanel(null)} />
    </>
  );
}
