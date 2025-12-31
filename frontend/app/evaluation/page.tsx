"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, Loader2, RefreshCw, ChevronLeft, LayoutDashboard, Clock, Users, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BatchStatus {
  run_id: string;
  status: "draft" | "pending" | "processing" | "completed" | "failed";
  progress: {
    total: number;
    processed: number;
    failed: number;
  };
  job: {
    title: string | null;
  } | null;
  results: {
    candidate_id: string | null;
    candidate_name: string | null;
    filename: string;
    final_score: number | null;
    hire_signal: string | null;
    status: string;
  }[];
  processing_time_seconds: number | null;
  created_at: string;
}

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

export default function EvaluationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [tokenInput, setTokenInput] = useState("");
  const [data, setData] = useState<BatchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async (t: string, isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const res = await fetch(`http://localhost:8000/batch/status/${t}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Invalid or expired token");
        throw new Error("Failed to fetch status");
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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

  // No token or error - show entry form
  if (!token || error) {
    return (
      <main className="px-6 py-20 min-h-[calc(100vh-80px)] bg-zinc-50/50">
        <div className="max-w-xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-sm border border-zinc-200 mb-4">
              <KeyRound className="w-8 h-8 text-blue-600" />
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
                    className="h-14 pl-4 bg-zinc-50/50 border-zinc-200 focus:ring-blue-500 focus:border-blue-500 rounded-xl"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-14 text-base font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-100 active:scale-[0.98] transition-all cursor-pointer">
                Access Results
              </Button>
            </form>
          </Card>
          
          <div className="text-center">
            <Link href="/" className="text-sm font-semibold text-zinc-500 hover:text-blue-600 transition-colors inline-flex items-center gap-1.5">
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
          <div className="w-16 h-16 rounded-full border-4 border-blue-50 animate-pulse" />
          <Loader2 className="absolute top-0 left-0 w-16 h-16 animate-spin text-blue-600 border-4 border-transparent border-t-blue-600 rounded-full" />
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
          <div className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-wider mb-1">
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
            <Badge variant="outline" className={`${isProcessing ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"} font-bold px-3 py-1 rounded-lg`}>
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
              <Users className="w-4 h-4 text-blue-500" />
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
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  Analyzing Resumes
                </span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <div className="relative h-4 w-full bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/50">
                <div 
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.3)]"
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
          {/* Results Table */}
          <Card className="shadow-lg border-zinc-200/60 rounded-3xl overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-zinc-50 border-b border-zinc-100">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-20 py-5 text-zinc-500 font-bold uppercase tracking-widest text-[10px] text-center">Rank</TableHead>
                  <TableHead className="py-5 text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Resume</TableHead>
                  <TableHead className="w-24 py-5 text-zinc-500 font-bold uppercase tracking-widest text-[10px] text-center">Score</TableHead>
                  <TableHead className="w-40 py-5 text-zinc-500 font-bold uppercase tracking-widest text-[10px] text-center">Hire Signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((result, index) => (
                  <TableRow key={result.candidate_id || index} className="group hover:bg-blue-50/30 transition-colors">
                    <TableCell className="text-center font-black text-zinc-400 group-hover:text-blue-600 transition-colors">
                      {index + 1}
                    </TableCell>
                    <TableCell className="py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 group-hover:bg-blue-100 flex items-center justify-center text-zinc-500 group-hover:text-blue-600 transition-all font-bold">
                          <FileText className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-zinc-900 truncate max-w-[300px]">
                          {result.filename}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {result.final_score !== null ? (
                        <div className="flex flex-col items-center">
                          <span className="font-black text-lg text-zinc-900">
                            {result.final_score}
                          </span>
                          <span className="text-[8px] font-black text-zinc-400 uppercase tracking-tighter -mt-1">Ranked</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {result.hire_signal ? (
                        <Badge className={`px-2.5 py-1 rounded-full font-bold text-[10px] border shadow-sm ${signalStyles[result.hire_signal] || ""}`}>
                          {signalLabels[result.hire_signal] || result.hire_signal}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-10">
            <Link href="/" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full h-14 px-8 rounded-2xl border-zinc-200 font-bold flex items-center gap-2 hover:bg-zinc-50 hover:border-zinc-300 transition-all cursor-pointer">
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
