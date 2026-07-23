"use client";

import {
    ChevronDown, ChevronLeft, Download, KeyRound, LayoutDashboard, Loader2, Plus,
    RefreshCw, RotateCcw, Sparkles, Users, X
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { CandidateCompareDialog } from '@/components/candidate-compare-dialog';
import { CompareBar } from '@/components/evaluation/compare-bar';
import { FilterControls } from '@/components/evaluation/filter-controls';
import { ProcessingProgress } from '@/components/evaluation/processing-progress';
import { ResultsTable } from '@/components/evaluation/results-table';
import { ResumeSheet } from '@/components/evaluation/resume-sheet';
import { StatsSummary } from '@/components/evaluation/stats-summary';
import { ResumeFileUpload } from '@/components/resume-file-upload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_COMPARE, type ResumePanelState, type SortBy } from '@/lib/evaluation-types';
import { ApiError } from '@/services/api';
import {
    AddCandidatesResponse, BatchStatus, CandidateBreakdown, CandidateResult,
    addCandidatesToBatch, getCandidateBreakdown, getBatchStatus,
    retryAllFailed, retrySingleFailed
} from '@/services/batch';

function AddCandidatesPanel({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AddCandidatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);

  const handleFilesChange = (newFiles: File[]) => {
    setFiles(newFiles);
    if (newFiles.length === 0 && isOpen) {
      setFilesError(null);
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      setFilesError("At least one resume PDF is required");
      return;
    }
    setError(null);
    setFilesError(null);
    setIsSubmitting(true);
    try {
      const res = await addCandidatesToBatch(token, files);
      setResult(res);
      setFiles([]);
      setIsOpen(false);
      onSuccess();
      setTimeout(() => setResult(null), 5000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {result && (
        <div className="bg-success border border-success-edge text-success-foreground text-sm px-4 py-3 rounded-xl flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-success-foreground shrink-0" />
          Added {result.uploaded} candidate{result.uploaded !== 1 ? "s" : ""} — evaluating now...
          {result.errors.length > 0 && (
            <span className="text-warning-foreground ml-2">({result.errors.length} skipped)</span>
          )}
        </div>
      )}

      {!isOpen ? (
        <button
          onClick={() => { setIsOpen(true); setResult(null); }}
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
              onClick={() => { setIsOpen(false); setFiles([]); setError(null); setFilesError(null); }}
              className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="bg-error border border-error-edge text-error-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <ResumeFileUpload
            files={files}
            onChange={handleFilesChange}
            error={filesError}
          />

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || files.length === 0}
            className="w-full h-12 font-bold rounded-xl cursor-pointer"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Evaluate {files.length > 0 ? `${files.length} ` : ""}Candidate{files.length !== 1 ? "s" : ""}
                <Sparkles className="w-4 h-4" />
              </span>
            )}
          </Button>
        </Card>
      )}
    </div>
  );
}

function EvaluationPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [tokenInput, setTokenInput] = useState("");
  const [data, setData] = useState<BatchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [breakdownCache, setBreakdownCache] = useState<
    Record<string, CandidateBreakdown | "loading" | "error">
  >({});
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const [retryingItemIds, setRetryingItemIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSignal, setFilterSignal] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("score_desc");
  const [resumePanel, setResumePanel] = useState<ResumePanelState | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const fetchStatus = async (t: string, isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await getBatchStatus(t);
      setData(data);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 404 ? 'Invalid or expired token' : err.message);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchStatus(token);
  }, [token]);

  const isProcessing = data?.status === "processing" || data?.status === "pending";

  // Auto-poll every 10 seconds while the run is processing
  useEffect(() => {
    if (!token || !isProcessing) return;
    const interval = setInterval(() => fetchStatus(token, true), 10000);
    return () => clearInterval(interval);
  }, [token, isProcessing]);

  // Reset controls when a new batch is loaded
  useEffect(() => {
    setSearchQuery("");
    setFilterSignal("all");
    setSortBy("score_desc");
    setCompareIds(new Set());
    setIsCompareOpen(false);
  }, [data?.run_id]);

  const handleRefresh = () => {
    if (token) fetchStatus(token, true);
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      router.push(`/evaluation?token=${tokenInput.trim()}`);
    }
  };

  const anyRetrying = isRetryingAll || retryingItemIds.size > 0;

  const handleRetryAll = async () => {
    if (!token) return;
    setIsRetryingAll(true);
    try {
      await retryAllFailed(token);
      await fetchStatus(token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to retry");
    } finally {
      setIsRetryingAll(false);
    }
  };

  const handleRetrySingle = async (itemId: string) => {
    if (!token) return;
    setRetryingItemIds(prev => new Set(prev).add(itemId));
    try {
      await retrySingleFailed(token, itemId);
      await fetchStatus(token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to retry");
    } finally {
      setRetryingItemIds(prev => { const next = new Set(prev); next.delete(itemId); return next; });
    }
  };

  const handleViewResume = async (e: React.MouseEvent, result: CandidateResult) => {
    e.stopPropagation();
    if (!result.candidate_id || !token) return;
    const cached = breakdownCache[result.candidate_id];
    if (cached && cached !== "loading" && cached !== "error" && cached.resume_markdown) {
      setResumePanel({ name: result.candidate_name ?? null, filename: result.filename, markdown: cached.resume_markdown });
      return;
    }
    setBreakdownCache(prev => ({ ...prev, [result.candidate_id!]: "loading" }));
    try {
      const bd = await getCandidateBreakdown(token, result.candidate_id);
      setBreakdownCache(prev => ({ ...prev, [result.candidate_id!]: bd }));
      setResumePanel({ name: result.candidate_name ?? null, filename: result.filename, markdown: bd.resume_markdown ?? "" });
    } catch {
      setBreakdownCache(prev => ({ ...prev, [result.candidate_id!]: "error" }));
    }
  };

  const exportToCSV = () => {
    if (!data?.results) return;
    const headers = ["Rank", "Name", "File", "Score (%)", "Hire Signal", "Status"];
    const rows = data.results.map((r, i) => [
      i + 1,
      r.candidate_name ?? r.filename,
      r.filename,
      r.final_score != null ? (r.final_score * 100).toFixed(1) : "N/A",
      r.hire_signal ?? "N/A",
      r.status,
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(data.job?.title ?? "results").replace(/\s+/g, "-").toLowerCase()}-candidates.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ensureBreakdown = async (candidateId: string) => {
    if (!token || breakdownCache[candidateId]) return;
    setBreakdownCache(prev => ({ ...prev, [candidateId]: "loading" }));
    try {
      const bd = await getCandidateBreakdown(token, candidateId);
      setBreakdownCache(prev => ({ ...prev, [candidateId]: bd }));
    } catch {
      setBreakdownCache(prev => ({ ...prev, [candidateId]: "error" }));
    }
  };

  const handleRowClick = (candidateId: string | null) => {
    if (!candidateId || !token) return;
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(candidateId)) { next.delete(candidateId); return next; }
      next.add(candidateId);
      return next;
    });
    ensureBreakdown(candidateId);
  };

  const toggleCompare = (candidateId: string) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else if (next.size < MAX_COMPARE) {
        next.add(candidateId);
      }
      return next;
    });
  };

  const handleOpenCompare = () => {
    compareIds.forEach(id => ensureBreakdown(id));
    setIsCompareOpen(true);
  };

  const handleRemoveFromCompare = (candidateId: string) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      next.delete(candidateId);
      if (next.size < 2) setIsCompareOpen(false);
      return next;
    });
  };

  // No token or error - show entry form
  if (!token || error) {
    return (
      <main className="px-6 py-20 min-h-[calc(100vh-80px)] bg-muted/30">
        <div className="max-w-xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-card shadow-sm border border-border mb-4">
              <KeyRound className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
              View Results
            </h1>
            <p className="text-muted-foreground font-medium">
              Enter your access token to view evaluation details
            </p>
          </div>

          <Card className="p-8 shadow-xl border-border/60 rounded-3xl">
            {error && (
              <div className="mb-6 bg-error border border-error-edge text-error-foreground text-sm p-4 rounded-xl flex items-start gap-3">
                <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="font-medium">{error}</p>
              </div>
            )}
            <form onSubmit={handleTokenSubmit} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="token" className="text-sm font-semibold text-foreground">
                  Access Token
                </Label>
                <div className="relative">
                  <Input
                    id="token"
                    placeholder="ai_batch_..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    required
                    className="h-14 pl-4 bg-muted/30 border-border focus:ring-primary focus:border-primary rounded-xl"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-14 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/10 active:scale-[0.98] transition-all cursor-pointer">
                Access Results
              </Button>
            </form>
          </Card>

          <div className="text-center">
            <Link href="/" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5">
              <ChevronLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Loading state
  if (isLoading && !data) {
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


  if (!data) return null;

  const progressPercent = data.progress.total > 0
    ? (data.progress.processed / data.progress.total) * 100
    : 0;

  const jobTitle = data.job?.title || "AI Evaluation Results";

  const completedResults = data.results.filter(r => r.final_score != null);
  const bestScore = completedResults.length > 0
    ? Math.round(Math.max(...completedResults.map(r => r.final_score!)) * 100)
    : null;
  const topMatchCount = data.results.filter(
    r => r.hire_signal === "strong_match" || r.hire_signal === "good_match"
  ).length;

  const sourceResults = isProcessing ? completedResults : data.results;
  const needsFilter = searchQuery !== "" || filterSignal !== "all";
  const needsSort = sortBy !== "score_desc";

  const displayResults = (() => {
    let results = sourceResults;

    if (needsFilter) {
      const q = searchQuery.toLowerCase();
      results = results.filter(r => {
        if (filterSignal !== "all" && r.hire_signal !== filterSignal) return false;
        if (q === "") return true;
        return (r.candidate_name?.toLowerCase().includes(q) ?? false) || r.filename.toLowerCase().includes(q);
      });
    }

    if (needsSort) {
      results = [...results].sort((a, b) => {
        const nameA = (a.candidate_name ?? a.filename).toLowerCase();
        const nameB = (b.candidate_name ?? b.filename).toLowerCase();
        const cmp = nameA.localeCompare(nameB);
        return sortBy === "name_asc" ? cmp : -cmp;
      });
    }

    return results;
  })();

  const isFiltered = needsFilter;

  const compareCandidates = sourceResults.filter(
    (r): r is CandidateResult & { candidate_id: string } =>
      r.candidate_id !== null && compareIds.has(r.candidate_id)
  );

  const expandableIds = displayResults.map(r => r.candidate_id).filter(Boolean) as string[];
  const allExpanded = expandableIds.length > 0 && expandableIds.every(id => expandedIds.has(id));
  const handleExpandAll = () => {
    if (allExpanded) { setExpandedIds(new Set()); return; }
    setExpandedIds(new Set(expandableIds));
    expandableIds.forEach(id => { if (!breakdownCache[id]) handleRowClick(id); });
  };

  return (
    <>
    <main className="px-6 py-12 max-w-5xl mx-auto min-h-[calc(100vh-80px)]">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-8 border-b border-border">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider mb-1">
            <LayoutDashboard className="w-4 h-4" />
            <span>Batch Details</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            {jobTitle}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Status</p>
            <Badge variant="outline" className={`${isProcessing ? "bg-primary/10 text-primary border-primary/20" : "bg-primary/10 text-primary border-primary/20"} font-bold px-3 py-1 rounded-lg`}>
              {isProcessing ? "Processing" : "Completed"}
            </Badge>
          </div>
          {!isProcessing && data.progress.failed > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryAll}
              disabled={anyRetrying}
              className="h-10 px-4 border-border text-muted-foreground hover:bg-muted font-semibold gap-2 cursor-pointer"
              title="Re-queue all failed candidates for evaluation"
            >
              {isRetryingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Retry Failed ({data.progress.failed})
            </Button>
          )}
          {!isProcessing && data.results.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              className="h-10 px-4 border-border text-muted-foreground hover:bg-muted font-semibold gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-10 h-10 border-border text-muted-foreground hover:bg-muted transition-all active:rotate-180 duration-500 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <StatsSummary
        candidateCount={data.results.length}
        processingTimeSeconds={data.processing_time_seconds}
        bestScore={bestScore}
        topMatchCount={topMatchCount}
        isProcessing={isProcessing}
      />

      {/* Progress Card */}
      {isProcessing && (
        <ProcessingProgress
          processed={data.progress.processed}
          total={data.progress.total}
          failed={data.progress.failed}
          percent={Math.round(progressPercent)}
        />
      )}

      <div className="space-y-8">
        {/* Search / filter controls */}
        {data.results.length > 0 && (
          <FilterControls
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterSignal={filterSignal}
            onFilterChange={setFilterSignal}
            isFiltered={isFiltered}
            shownCount={displayResults.length}
            totalCount={sourceResults.length}
          />
        )}

        {/* Results table — shown when completed, or when partial results exist during processing */}
        {(!isProcessing || completedResults.length > 0) && (
          <>
            {isProcessing && (
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5 text-success-foreground" />
                Results So Far
              </div>
            )}

            {!isProcessing && data.results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Users className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-foreground font-bold text-lg">No candidates yet</p>
                <p className="text-muted-foreground text-sm mt-1">Add resumes below to start evaluating candidates.</p>
              </div>
            ) : (
              <ResultsTable
                items={displayResults}
                pendingItems={data.results.filter(r => r.final_score === null)}
                expandedIds={expandedIds}
                breakdownCache={breakdownCache}
                compareIds={compareIds}
                sortBy={sortBy}
                onSort={() => setSortBy(prev => prev === "name_asc" ? "name_desc" : prev === "name_desc" ? "score_desc" : "name_asc")}
                onRowClick={(item) => handleRowClick(item.candidate_id)}
                onToggleCompare={toggleCompare}
                onViewResume={handleViewResume}
                allExpanded={allExpanded}
                onExpandAll={handleExpandAll}
                isProcessing={isProcessing}
                isFiltered={needsFilter}
                showEmptyFilterRow={displayResults.length === 0}
                onClearFilters={() => { setSearchQuery(""); setFilterSignal("all"); }}
                getCompareId={(item) => item.candidate_id!}
                getBreakdownKey={(item) => item.candidate_id}
                renderRowAction={(item) => {
                  // Only override the default chevron for failed rows. When the
                  // run is settled, a failed row shows a retry button; while
                  // still processing it shows nothing (matching prior behavior).
                  if (item.status !== "failed") return null;
                  if (isProcessing) {
                    return item.candidate_id
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      : <></>;
                  }
                  const isRetryingThis = retryingItemIds.has(item.item_id);
                  return (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRetrySingle(item.item_id); }}
                      disabled={anyRetrying}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      title="Re-queue this candidate for evaluation"
                    >
                      {isRetryingThis
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RotateCcw className="w-4 h-4" />
                      }
                    </button>
                  );
                }}
              />
          )}
          </>
        )}

        <div className="space-y-6 pt-2">
          <AddCandidatesPanel
            token={token}
            onSuccess={() => fetchStatus(token)}
          />
          <div className="flex justify-center pt-6 border-t border-border">
            <Link href="/">
              <Button variant="outline" className="gap-2 cursor-pointer">
                <LayoutDashboard className="w-4 h-4" />
                New Batch
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Floating compare bar */}
      <CompareBar
        candidates={compareCandidates}
        getKey={(c) => c.candidate_id!}
        onRemove={handleRemoveFromCompare}
        onClear={() => setCompareIds(new Set())}
        onOpen={handleOpenCompare}
      />

    </main>

    <CandidateCompareDialog
      open={isCompareOpen}
      onOpenChange={setIsCompareOpen}
      candidates={compareCandidates}
      breakdowns={breakdownCache}
      onRemove={handleRemoveFromCompare}
    />

    <ResumeSheet panel={resumePanel} onClose={() => setResumePanel(null)} />
    </>
  );
}

export default function EvaluationPage() {
  return (
    <React.Suspense>
      <EvaluationPageInner />
    </React.Suspense>
  );
}
