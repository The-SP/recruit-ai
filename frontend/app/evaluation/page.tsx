"use client";

import {
    BookOpen, Briefcase, ChevronDown, ChevronLeft, ChevronUp, Clock, FileText,
    KeyRound, LayoutDashboard, Loader2, RefreshCw, Users, X, Zap
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ApiError } from '@/services/api';
import {
    BatchStatus, CandidateBreakdown, getCandidateBreakdown, getBatchStatus
} from '@/services/batch';

const signalStyles: Record<string, string> = {
  strong_match: "bg-emerald-100 text-emerald-700 border-emerald-200",
  good_match: "bg-blue-100 text-blue-700 border-blue-200",
  partial_match: "bg-amber-100 text-amber-700 border-amber-200",
  weak_match: "bg-orange-100 text-orange-700 border-orange-200",
  no_match: "bg-red-100 text-red-700 border-red-200",
};

const signalLabels: Record<string, string> = {
  strong_match: "Strong Match",
  good_match: "Good Match",
  partial_match: "Partial Match",
  weak_match: "Weak Match",
  no_match: "No Match",
};

const matchTypeStyles: Record<string, string> = {
  exact: "bg-emerald-100 text-emerald-700 border-emerald-200",
  equivalent: "bg-blue-100 text-blue-700 border-blue-200",
  transferable: "bg-amber-100 text-amber-700 border-amber-200",
  foundational: "bg-orange-100 text-orange-700 border-orange-200",
  none: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

const matchTypeLabels: Record<string, string> = {
  exact: "Exact",
  equivalent: "Equivalent",
  transferable: "Transferable",
  foundational: "Foundational",
  none: "No Match",
};

const tierStyles: Record<string, string> = {
  critical: "bg-red-50 text-red-600 border-red-200",
  required: "bg-blue-50 text-blue-600 border-blue-200",
  preferred: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

const relevanceStyles: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-orange-100 text-orange-700 border-orange-200",
  none: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

function CandidateBreakdownPanel({
  breakdown,
  isExpanded,
}: {
  breakdown: CandidateBreakdown | "loading" | "error" | undefined;
  isExpanded: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-300",
        isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
      )}
    >
      <div className="px-6 py-6 bg-zinc-50/70 border-t border-zinc-100 space-y-6 overflow-hidden w-full">
        {breakdown === "loading" && (
          <div className="flex items-center gap-3 py-4 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Loading breakdown...</span>
          </div>
        )}

        {breakdown === "error" && (
          <div className="flex items-center gap-2 text-red-500 py-2">
            <X className="w-4 h-4" />
            <span className="text-sm">Failed to load breakdown details.</span>
          </div>
        )}

        {breakdown && breakdown !== "loading" && breakdown !== "error" && (
          <>
            {breakdown.summary && (
              <p className="text-sm text-zinc-600 leading-relaxed">
                {breakdown.summary}
              </p>
            )}

            {/* Component score bars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Skills", value: breakdown.skill_score, icon: <Zap className="w-4 h-4" /> },
                { label: "Experience", value: breakdown.experience_score, icon: <Briefcase className="w-4 h-4" /> },
                { label: "Education", value: breakdown.education_score, icon: <BookOpen className="w-4 h-4" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-zinc-500">
                      {icon}
                      {label}
                    </span>
                    <span className="text-zinc-900">
                      {value != null ? `${Math.round(value * 100)}%` : "N/A"}
                    </span>
                  </div>
                  <Progress value={value != null ? Math.round(value * 100) : 0} className="h-2" />
                </div>
              ))}
            </div>

            {/* Skills section */}
            {breakdown.skills && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" />
                  Skill Evaluation
                </h3>

                {breakdown.skills.critical_gaps.length > 0 && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <span className="font-bold">Critical gaps: </span>
                    {breakdown.skills.critical_gaps.join(", ")}
                  </div>
                )}

                <div className="space-y-2">
                  {breakdown.skills.llm_response.evaluations.map((ev, i) => (
                    <div key={i} className="bg-white border border-zinc-100 rounded-xl p-3 space-y-1.5 overflow-hidden">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm text-zinc-800 break-words">
                          {ev.skill_options.join(" / ")}
                        </span>
                        <Badge variant="outline" className={tierStyles[ev.tier]}>
                          {ev.tier}
                        </Badge>
                        <Badge variant="outline" className={matchTypeStyles[ev.match_type]}>
                          {matchTypeLabels[ev.match_type] || ev.match_type}
                        </Badge>
                      </div>
                      {ev.matched_by && (
                        <p className="text-xs text-zinc-500 break-words">
                          Matched by: <span className="font-medium">{ev.matched_by}</span>
                        </p>
                      )}
                      <p className="text-xs text-zinc-500 italic break-words">{ev.evidence}</p>
                      <p className="text-xs text-zinc-600 break-words">{ev.reasoning}</p>
                    </div>
                  ))}
                </div>

                {breakdown.skills.llm_response.strengths.length > 0 && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    <span className="font-bold">Strengths: </span>
                    {breakdown.skills.llm_response.strengths.join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Experience section */}
            {breakdown.experience && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" />
                  Experience Evaluation
                  <span className="ml-auto text-zinc-500 normal-case font-medium">
                    {breakdown.experience.effective_years.toFixed(1)} yrs effective
                    {" / "}
                    {breakdown.experience.required_years.toFixed(1)} yrs required
                  </span>
                </h3>

                <div className="space-y-2">
                  {breakdown.experience.llm_response.evaluations.map((job, i) => (
                    <div key={i} className="bg-white border border-zinc-100 rounded-xl p-3 space-y-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-sm text-zinc-800 break-words">{job.job_title}</span>
                          {job.company && (
                            <span className="text-xs text-zinc-400 ml-2">@ {job.company}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-zinc-400">{job.duration_months} mo</span>
                          <Badge variant="outline" className={relevanceStyles[job.relevance]}>
                            {job.relevance}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 italic break-words">{job.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education section */}
            {breakdown.education && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5" />
                  Education
                </h3>
                <div className="bg-white border border-zinc-100 rounded-xl p-3 space-y-1">
                  {breakdown.education.candidate_degree && (
                    <p className="text-sm font-medium text-zinc-800">
                      {breakdown.education.candidate_degree}
                      {breakdown.education.field_of_study && (
                        <span className="text-zinc-500 font-normal">
                          {" — "}{breakdown.education.field_of_study}
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500">{breakdown.education.summary}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function EvaluationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [tokenInput, setTokenInput] = useState("");
  const [data, setData] = useState<BatchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [breakdownCache, setBreakdownCache] = useState<
    Record<string, CandidateBreakdown | "loading" | "error">
  >({});

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

  const handleRefresh = () => {
    if (token) fetchStatus(token, true);
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      router.push(`/evaluation?token=${tokenInput.trim()}`);
    }
  };

  const handleRowClick = async (candidateId: string | null) => {
    if (!candidateId || !token) return;
    if (expandedId === candidateId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(candidateId);
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
      <main className="px-6 py-20 min-h-[calc(100vh-80px)] bg-zinc-50/50">
        <div className="max-w-xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-sm border border-zinc-200 mb-4">
              <KeyRound className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight">
              View Results
            </h1>
            <p className="text-zinc-500 font-medium">
              Enter your access token to view evaluation details
            </p>
          </div>

          <Card className="p-8 shadow-xl border-zinc-200/60 rounded-3xl bg-white">
            {error && (
              <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-sm p-4 rounded-xl flex items-start gap-3">
                <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="font-medium">{error}</p>
              </div>
            )}
            <form onSubmit={handleTokenSubmit} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="token" className="text-sm font-semibold text-zinc-700">
                  Access Token
                </Label>
                <div className="relative">
                  <Input
                    id="token"
                    placeholder="ai_batch_..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    required
                    className="h-14 pl-4 bg-zinc-50/50 border-zinc-200 focus:ring-primary focus:border-primary rounded-xl"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-14 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/10 active:scale-[0.98] transition-all cursor-pointer">
                Access Results
              </Button>
            </form>
          </Card>

          <div className="text-center">
            <Link href="/" className="text-sm font-semibold text-zinc-500 hover:text-primary transition-colors inline-flex items-center gap-1.5">
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
        <p className="mt-6 text-zinc-900 font-bold text-lg">Fetching your results...</p>
        <p className="text-zinc-500 text-sm mt-1">This will only take a moment</p>
      </main>
    );
  }


  if (!data) return null;

  const isProcessing = data.status === "processing" || data.status === "pending";
  const progressPercent = data.progress.total > 0
    ? (data.progress.processed / data.progress.total) * 100
    : 0;

  const jobTitle = data.job?.title || "AI Evaluation Results";

  return (
    <main className="px-6 py-12 max-w-5xl mx-auto min-h-[calc(100vh-80px)]">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-8 border-b border-zinc-100">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider mb-1">
            <LayoutDashboard className="w-4 h-4" />
            <span>Batch Details</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-zinc-900 tracking-tight">
            {jobTitle}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Status</p>
            <Badge variant="outline" className={`${isProcessing ? "bg-primary/10 text-primary border-primary/20" : "bg-emerald-50 text-emerald-700 border-emerald-100"} font-bold px-3 py-1 rounded-lg`}>
              {isProcessing ? "Processing" : "Completed"}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-10 h-10 rounded-xl border-zinc-200 text-zinc-500 hover:bg-zinc-50 transition-all active:rotate-180 duration-500 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
          <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 text-zinc-500 mb-3 text-sm font-semibold">
              <Users className="w-4 h-4 text-primary" />
              Candidates
            </div>
            <div className="text-3xl font-black text-zinc-900">{data.results.length}</div>
          </div>
          <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 text-zinc-500 mb-3 text-sm font-semibold">
              <Clock className="w-4 h-4 text-amber-500" />
              Proc. Time
            </div>
            <div className="text-3xl font-black text-zinc-900">
              {data.processing_time_seconds ? Math.round(data.processing_time_seconds) : "—"}
              <span className="text-xs font-bold text-zinc-400 ml-1.5 uppercase">Seconds</span>
            </div>
          </div>
        </div>

      {/* Progress View */}
      {isProcessing ? (
        <Card className="p-10 shadow-xl border-zinc-200/60 rounded-3xl bg-white text-center">
          <div className="max-w-md mx-auto space-y-8">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm font-black text-zinc-900 uppercase tracking-widest">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  Analyzing Resumes
                </span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <div className="relative h-4 w-full bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/50">
                <div
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500 rounded-full shadow-[0_0_10px_theme(colors.primary/30%)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-zinc-500 text-sm font-medium">
                {data.progress.processed} of {data.progress.total} candidates completed
              </p>
            </div>

            <div className="pt-4">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-12 px-8 rounded-xl border-zinc-200 font-bold flex items-center gap-2 hover:bg-zinc-50 active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Updating..." : "Check Progress"}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 text-center">Rank</TableHead>
                  <TableHead>Resume</TableHead>
                  <TableHead className="w-24 text-center">Score</TableHead>
                  <TableHead className="w-40 text-center">Hire Signal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((result, index) => {
                  const id = result.candidate_id;
                  const isExpanded = id !== null && expandedId === id;
                  const breakdown = id ? breakdownCache[id] : undefined;

                  return (
                    <React.Fragment key={result.candidate_id ?? index}>
                      <TableRow
                        onClick={() => handleRowClick(result.candidate_id)}
                        className={cn(
                          "cursor-pointer select-none",
                          isExpanded && "bg-zinc-50"
                        )}
                      >
                        <TableCell className="text-center font-bold">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-zinc-400 shrink-0" />
                            <div>
                              <span className="font-medium truncate">{result.filename}</span>
                              {result.candidate_name && (
                                <p className="text-xs text-zinc-400">{result.candidate_name}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold">
                          {result.final_score != null
                            ? `${Math.round(result.final_score * 100)}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {result.hire_signal ? (
                            <Badge variant="outline" className={signalStyles[result.hire_signal]}>
                              {signalLabels[result.hire_signal] || result.hire_signal}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center w-10">
                          {id && (
                            isExpanded
                              ? <ChevronUp className="w-4 h-4 text-zinc-400 mx-auto" />
                              : <ChevronDown className="w-4 h-4 text-zinc-400 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>

                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="p-0 border-b-0 whitespace-normal">
                          <CandidateBreakdownPanel breakdown={breakdown} isExpanded={isExpanded} />
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-center pt-10">
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <ChevronLeft className="w-4 h-4" />
                Submit Another Batch
              </Button>
            </Link>
          </div>
        </div>
      )}

    </main>
  );
}
