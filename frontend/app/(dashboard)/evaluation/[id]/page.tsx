"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Briefcase,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import React, { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { ResumeFileUpload } from "@/components/resume-file-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  SKILL_TIERS,
  matchTypeLabels,
  matchTypeStyles,
  relevanceStyles,
  scoreBarColor,
  signalLabels,
  signalStyles,
  tierSectionStyles,
} from "@/lib/evaluation-styles";
import { ApiError } from "@/services/api";
import { type CandidateBreakdown } from "@/services/batch";
import {
  addCandidatesToRun,
  getEvaluationRun,
  getRunCandidateBreakdown,
  retryFailedRun,
  type EvaluationRunDetail,
  type RunItemSummary,
} from "@/services/runs";

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
  const [retryingAll, setRetryingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSignal, setFilterSignal] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("score_desc");
  const [resumePanel, setResumePanel] = useState<{
    name: string | null;
    filename: string;
    markdown: string;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addFilesError, setAddFilesError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const handleRowClick = useCallback(async (item: RunItemSummary) => {
    const id = item.item_id;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      next.add(id);
      return next;
    });
    if (!item.candidate_id || breakdownCache[id]) return;
    setBreakdownCache((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const bd = await getRunCandidateBreakdown(runId, item.candidate_id);
      setBreakdownCache((prev) => ({ ...prev, [id]: bd }));
    } catch {
      setBreakdownCache((prev) => ({ ...prev, [id]: "error" }));
    }
  }, [breakdownCache, runId]);

  const handleViewResume = async (e: React.MouseEvent, item: RunItemSummary) => {
    e.stopPropagation();
    if (!item.candidate_id) return;
    const cached = breakdownCache[item.item_id];
    if (cached && cached !== "loading" && cached !== "error" && cached.resume_markdown) {
      setResumePanel({ name: item.candidate_name ?? null, filename: item.filename, markdown: cached.resume_markdown });
      return;
    }
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2 text-xs font-semibold">
              <Users className="w-3.5 h-3.5 text-primary" />
              Candidates
            </div>
            <div className="text-3xl font-black text-foreground">{data.total_count}</div>
          </div>
          {!isActive && (
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
                <div className="text-3xl font-black text-foreground">{topMatchCount > 0 ? topMatchCount : "—"}</div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Candidates with a Strong Match or Good Match hire signal (≥ 70%)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Progress Card */}
        {isActive && (
          <Card className="p-8 shadow-xl border-border rounded-3xl bg-card mb-8">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 text-sm font-black text-foreground uppercase tracking-widest">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  Analyzing Resumes
                </span>
                <span className="tabular-nums">{progressPercent}%</span>
              </div>
              <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden border border-border/50">
                <div
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500 rounded-full shadow-[0_0_10px_theme(colors.primary/30%)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pt-0.5">
                <span>
                  {data.processed_count} of {data.total_count} candidates completed
                  {failedCount > 0 && (
                    <span className="text-error-foreground ml-1">({failedCount} failed)</span>
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
          {data.items.length > 0 && (
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
                  {filteredItems.length} of {sourceItems.length}
                </span>
              )}
            </div>
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
                <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-foreground/[0.06] hover:bg-foreground/[0.06] border-b-2 border-foreground/15">
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
                          <button
                            onClick={handleExpandAll}
                            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          >
                            {allExpanded ? "Collapse all" : "Expand all"}
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&_tr]:border-foreground/10">

                      {filteredItems.length === 0 && isFiltered ? (
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

                      {filteredItems.map((item, index) => {
                        const isExpanded = expandedIds.has(item.item_id);
                        const isFailed = item.status === "failed";
                        const scorePct = item.final_score != null ? Math.round(item.final_score * 100) : null;
                        const breakdown = breakdownCache[item.item_id];

                        return (
                          <React.Fragment key={item.item_id}>
                            <TableRow
                              onClick={() => !isFailed && handleRowClick(item)}
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
                                    {signalLabels[item.hire_signal] ?? item.hire_signal}
                                  </Badge>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-right pr-3 w-24">
                                <div className="flex items-center justify-end gap-1">
                                  {!isFailed && item.candidate_id && (
                                    <button
                                      onClick={(e) => handleViewResume(e, item)}
                                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                      title="View resume"
                                    >
                                      <FileText className="w-4 h-4" />
                                    </button>
                                  )}
                                  {!isFailed && item.candidate_id && (
                                    isExpanded
                                      ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={5} className="p-0 border-b-0 whitespace-normal">
                                <CandidateBreakdownPanel
                                  key={`${item.item_id}-${isExpanded}`}
                                  breakdown={breakdown}
                                  isExpanded={isExpanded}
                                />
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        );
                      })}

                      {/* Skeleton rows for candidates still being processed */}
                      {isActive && data.items
                        .filter(i => i.final_score === null)
                        .map((item, i) => (
                          <TableRow key={`pending-${item.filename}-${i}`} className="opacity-50">
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
