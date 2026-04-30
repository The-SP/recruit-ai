"use client";

import {
    ArrowDown, ArrowUp, BookOpen, Briefcase, CheckCircle, ChevronDown, ChevronLeft, ChevronUp,
    Clock, Download, FileText, KeyRound, LayoutDashboard, Loader2, Plus, RefreshCw, RotateCcw,
    Search, Sparkles, Users, X, Zap
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { ResumeFileUpload } from '@/components/resume-file-upload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  SKILL_TIERS,
  matchTypeLabels,
  matchTypeStyles,
  relevanceStyles,
  scoreBarColor,
  signalLabels,
  signalStyles,
  tierSectionStyles,
} from '@/lib/evaluation-styles';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ApiError } from '@/services/api';
import {
    AddCandidatesResponse, BatchStatus, CandidateBreakdown, CandidateResult,
    addCandidatesToBatch, getCandidateBreakdown, getBatchStatus,
    retryAllFailed, retrySingleFailed
} from '@/services/batch';

type BreakdownSection = "skills" | "experience" | "education";
type SortBy = "score_desc" | "name_asc" | "name_desc";

function CandidateBreakdownPanel({
  breakdown,
  isExpanded,
}: {
  breakdown: CandidateBreakdown | "loading" | "error" | undefined;
  isExpanded: boolean;
}) {
  const [activeSection, setActiveSection] = useState<BreakdownSection | null>(null);

  const handleBarClick = (section: BreakdownSection) => {
    setActiveSection(prev => prev === section ? null : section);
  };

  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-300",
        isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
      )}
    >
      <div className="px-6 py-6 bg-muted/50 border-t border-border space-y-6 overflow-hidden w-full">
        {breakdown === "loading" && (
          <div className="flex items-center gap-3 py-4 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Loading breakdown...</span>
          </div>
        )}

        {breakdown === "error" && (
          <div className="flex items-center gap-2 text-error-foreground py-2">
            <X className="w-4 h-4" />
            <span className="text-sm">Failed to load breakdown details.</span>
          </div>
        )}

        {breakdown && breakdown !== "loading" && breakdown !== "error" && (
          <>
            {breakdown.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {breakdown.summary}
              </p>
            )}

            {/* Clickable score bars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { key: "skills" as BreakdownSection, label: "Skills", value: breakdown.skill_score, icon: <Zap className="w-4 h-4" /> },
                { key: "experience" as BreakdownSection, label: "Experience", value: breakdown.experience_score, icon: <Briefcase className="w-4 h-4" /> },
                { key: "education" as BreakdownSection, label: "Education", value: breakdown.education_score, icon: <BookOpen className="w-4 h-4" /> },
              ]).map(({ key, label, value, icon }) => {
                const isActive = activeSection === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleBarClick(key)}
                    className={cn(
                      "text-left rounded-xl p-3 space-y-1.5 border transition-all cursor-pointer select-none",
                      isActive
                        ? "bg-card border-border shadow-sm"
                        : "bg-card/50 border-border/60 hover:border-border hover:bg-card hover:shadow-sm"
                    )}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className={cn("flex items-center gap-1.5", isActive ? "text-foreground" : "text-muted-foreground")}>
                        {icon}
                        {label}
                      </span>
                      <span className={isActive ? "text-foreground" : "text-muted-foreground"}>
                        {value != null ? `${Math.round(value * 100)}%` : "N/A"}
                      </span>
                    </div>
                    <Progress
                      value={value != null ? Math.round(value * 100) : 0}
                      className={cn("h-2", value != null && scoreBarColor(value))}
                    />
                  </button>
                );
              })}
            </div>

            {/* Skills section */}
            {activeSection === "skills" && breakdown.skills && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" />
                  Skill Evaluation
                </h3>

                {breakdown.skills.critical_gaps.length > 0 && (
                  <div className="text-xs text-error-foreground bg-error border border-error-edge rounded-lg px-3 py-2">
                    <span className="font-bold">Critical gaps: </span>
                    {breakdown.skills.critical_gaps.join(", ")}
                  </div>
                )}

                {SKILL_TIERS.map((tier) => {
                  const evsForTier = breakdown.skills!.llm_response.evaluations.filter(
                    (ev) => ev.tier === tier
                  );
                  if (evsForTier.length === 0) return null;
                  const { label, headerClass } = tierSectionStyles[tier];
                  return (
                    <div key={tier} className="space-y-1.5">
                      <p className={cn("text-[10px] font-bold uppercase tracking-widest", headerClass)}>
                        {label}
                      </p>
                      <div className="space-y-2">
                        {evsForTier.map((ev, i) => (
                          <div key={i} className="bg-card border border-border rounded-xl p-3 space-y-1.5 overflow-hidden">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm text-foreground break-words">
                                {ev.skill_options.join(" / ")}
                              </span>
                              <Badge variant="outline" className={matchTypeStyles[ev.match_type]}>
                                {matchTypeLabels[ev.match_type] || ev.match_type}
                              </Badge>
                            </div>
                            {ev.matched_by && (
                              <p className="text-xs text-muted-foreground break-words">
                                Matched by: <span className="font-medium">{ev.matched_by}</span>
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground break-words">
                              <span className="font-semibold not-italic">Evidence: </span>
                              <span className="italic">{ev.evidence}</span>
                            </p>
                            <p className="text-xs text-muted-foreground break-words">
                              <span className="font-semibold">Reasoning: </span>
                              {ev.reasoning}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {breakdown.skills.llm_response.strengths.length > 0 && (
                  <div className="text-xs text-success-foreground bg-success border border-success-edge rounded-lg px-3 py-2">
                    <span className="font-bold">Strengths: </span>
                    {breakdown.skills.llm_response.strengths.join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Experience section */}
            {activeSection === "experience" && breakdown.experience && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" />
                  Experience Evaluation
                  <span className="ml-auto text-muted-foreground normal-case font-medium">
                    {breakdown.experience.effective_years.toFixed(1)} yrs effective
                    {" / "}
                    {breakdown.experience.required_years.toFixed(1)} yrs required
                  </span>
                </h3>

                {/* Experience requirement progress bar */}
                {breakdown.experience.required_years > 0 && (
                  <div className="space-y-1">
                    <Progress
                      value={Math.min(
                        (breakdown.experience.effective_years / breakdown.experience.required_years) * 100,
                        100
                      )}
                      className={cn(
                        "h-1.5",
                        breakdown.experience.effective_years >= breakdown.experience.required_years
                          ? "[&>div]:bg-success-bar"
                          : breakdown.experience.effective_years >= breakdown.experience.required_years * 0.7
                          ? "[&>div]:bg-warning-bar"
                          : "[&>div]:bg-error-bar"
                      )}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {breakdown.experience.llm_response.evaluations.map((job, i) => (
                    <div key={i} className="bg-card border border-border rounded-xl p-3 space-y-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-sm text-foreground break-words">{job.job_title}</span>
                          {job.company && (
                            <span className="text-xs text-muted-foreground ml-2">@ {job.company}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{job.duration_months} mo</span>
                          <Badge variant="outline" className={relevanceStyles[job.relevance]}>
                            {job.relevance} relevance
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground italic break-words">{job.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education section */}
            {activeSection === "education" && breakdown.education && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5" />
                  Education
                </h3>
                <div className="bg-card border border-border rounded-xl p-3 space-y-1">
                  {breakdown.education.candidate_degree && (
                    <p className="text-sm font-medium text-foreground">
                      {breakdown.education.candidate_degree}
                      {breakdown.education.field_of_study && (
                        <span className="text-muted-foreground font-normal">
                          {" — "}{breakdown.education.field_of_study}
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{breakdown.education.summary}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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
  const [resumePanel, setResumePanel] = useState<{
    name: string | null;
    filename: string;
    markdown: string;
  } | null>(null);

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

  const handleRowClick = async (candidateId: string | null) => {
    if (!candidateId || !token) return;
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(candidateId)) { next.delete(candidateId); return next; }
      next.add(candidateId);
      return next;
    });
    if (breakdownCache[candidateId]) return;
    setBreakdownCache(prev => ({ ...prev, [candidateId]: "loading" }));
    try {
      const bd = await getCandidateBreakdown(token, candidateId);
      setBreakdownCache(prev => ({ ...prev, [candidateId]: bd }));
    } catch {
      setBreakdownCache(prev => ({ ...prev, [candidateId]: "error" }));
    }
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2 text-xs font-semibold">
            <Users className="w-3.5 h-3.5 text-primary" />
            Candidates
          </div>
          <div className="text-3xl font-black text-foreground">{data.results.length}</div>
        </div>
        {!isProcessing && (
          <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-2 text-xs font-semibold">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Proc. Time
            </div>
            <div className="text-3xl font-black text-foreground">
              {data.processing_time_seconds ? Math.round(data.processing_time_seconds) : "—"}
              <span className="text-xs font-bold text-muted-foreground ml-1 uppercase">s</span>
            </div>
          </div>
        )}
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            Best Score
          </div>
          <div className="text-3xl font-black text-foreground">
            {bestScore != null ? `${bestScore}%` : "—"}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="bg-white dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700 p-5 rounded-2xl shadow-sm cursor-default">
              <div className="flex items-center gap-2 text-muted-foreground mb-2 text-xs font-semibold">
                <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                Top Matches
              </div>
              <div className="text-3xl font-black text-foreground">{topMatchCount > 0 ? topMatchCount : "-"}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Candidates with a Strong Match or Good Match hire signal (≥ 70%)</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Progress Card */}
      {isProcessing && (
        <Card className="p-8 shadow-xl border-border rounded-3xl bg-card mb-8">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 text-sm font-black text-foreground uppercase tracking-widest">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Analyzing Resumes
              </span>
              <span className="tabular-nums">{Math.round(progressPercent)}%</span>
            </div>
            <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden border border-border/50">
              <div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500 rounded-full shadow-[0_0_10px_theme(colors.primary/30%)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pt-0.5">
              <span>
                {data.progress.processed} of {data.progress.total} candidates completed
                {data.progress.failed > 0 && (
                  <span className="text-error-foreground ml-1">({data.progress.failed} failed)</span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" />
                Auto-refreshing every 10s
              </span>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-8">
        {/* Search / filter controls */}
        {data.results.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <Input
                placeholder="Search by name or file…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9 rounded-xl border-zinc-200 text-sm"
              />
            </div>
            <Select value={filterSignal} onValueChange={setFilterSignal}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Signals</SelectItem>
                <SelectItem value="strong_match">Strong Match</SelectItem>
                <SelectItem value="good_match">Good Match</SelectItem>
                <SelectItem value="partial_match">Partial Match</SelectItem>
                <SelectItem value="weak_match">Weak Match</SelectItem>
                <SelectItem value="no_match">No Match</SelectItem>
              </SelectContent>
            </Select>
            {isFiltered && (
              <span className="text-xs font-medium text-muted-foreground ml-1">
                {displayResults.length} of {sourceResults.length}
              </span>
            )}
          </div>
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
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20 text-center">Rank</TableHead>
                      <TableHead>
                        <button
                          onClick={() => setSortBy(prev => prev === "name_asc" ? "name_desc" : prev === "name_desc" ? "score_desc" : "name_asc")}
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
                        {(() => {
                          const expandableIds = displayResults
                            .map(r => r.candidate_id)
                            .filter(Boolean) as string[];
                          const allExpanded = expandableIds.length > 0 && expandableIds.every(id => expandedIds.has(id));
                          const handleExpandAll = () => {
                            if (allExpanded) { setExpandedIds(new Set()); return; }
                            setExpandedIds(new Set(expandableIds));
                            expandableIds.forEach(id => { if (!breakdownCache[id]) handleRowClick(id); });
                          };
                          return (
                            <button
                              onClick={handleExpandAll}
                              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              {allExpanded ? "Collapse all" : "Expand all"}
                            </button>
                          );
                        })()}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayResults.length === 0 && (needsFilter) ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-16 text-center">
                          <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">No candidates match your filters.</p>
                          <button
                            onClick={() => { setSearchQuery(""); setFilterSignal("all"); }}
                            className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
                          >
                            Clear filters
                          </button>
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {displayResults.map((result, index) => {
                    const id = result.candidate_id;
                    const isExpanded = id !== null && expandedIds.has(id);
                    const breakdown = id ? breakdownCache[id] : undefined;
                    const scorePct = result.final_score != null ? Math.round(result.final_score * 100) : null;

                    return (
                      <React.Fragment key={result.candidate_id ?? index}>
                        {(() => {
                          const isFailed = result.status === "failed";
                          const isRetryingThis = retryingItemIds.has(result.item_id);
                          return (
                            <TableRow
                              onClick={() => !isFailed && handleRowClick(result.candidate_id)}
                              className={cn(
                                "select-none",
                                isFailed ? "opacity-60" : "cursor-pointer",
                                isExpanded && "bg-muted/50"
                              )}
                            >
                              <TableCell className="text-center font-bold">{index + 1}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <FileText className={cn("w-5 h-5 shrink-0", isFailed ? "text-error-border" : "text-muted-foreground")} />
                                  <div>
                                    <span className="font-medium truncate">
                                      {result.candidate_name ?? result.filename}
                                    </span>
                                    {result.candidate_name && (
                                      <p className="text-xs text-muted-foreground">{result.filename}</p>
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
                                      className={cn("h-1 w-16", scoreBarColor(result.final_score!))}
                                    />
                                  </div>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                {result.hire_signal ? (
                                  <Badge variant="outline" className={signalStyles[result.hire_signal]}>
                                    {signalLabels[result.hire_signal] || result.hire_signal}
                                  </Badge>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-right pr-3 w-24">
                                <div className="flex items-center justify-end gap-1">
                                  {!isFailed && id && (
                                    <button
                                      onClick={(e) => handleViewResume(e, result)}
                                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                      title="View resume"
                                    >
                                      <FileText className="w-4 h-4" />
                                    </button>
                                  )}
                                  {isFailed && !isProcessing ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRetrySingle(result.item_id); }}
                                      disabled={anyRetrying}
                                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                      title="Re-queue this candidate for evaluation"
                                    >
                                      {isRetryingThis
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <RotateCcw className="w-4 h-4" />
                                      }
                                    </button>
                                  ) : id && (
                                    isExpanded
                                      ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })()}

                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="p-0 border-b-0 whitespace-normal">
                            <CandidateBreakdownPanel key={`${id}-${isExpanded}`} breakdown={breakdown} isExpanded={isExpanded} />
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}

                  {/* Skeleton rows for candidates still being processed */}
                  {isProcessing && data.results
                    .filter(r => r.final_score === null)
                    .map((result, i) => (
                      <TableRow key={`pending-${result.filename}-${i}`} className="opacity-50">
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
                    ))
                  }
                </TableBody>
              </Table>
            </div>
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

    </main>

    <Sheet open={resumePanel !== null} onOpenChange={open => { if (!open) setResumePanel(null); }}>
      <SheetContent side="right" className="w-[480px] sm:w-[540px] sm:max-w-none flex flex-col p-0">
        <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
          <SheetTitle className="text-base font-bold leading-tight">
            {resumePanel?.name ?? resumePanel?.filename}
          </SheetTitle>
          {resumePanel?.name && (
            <p className="text-xs text-muted-foreground mt-0.5">{resumePanel.filename}</p>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {resumePanel?.markdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
              <ReactMarkdown>{resumePanel.markdown}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No resume content available.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
