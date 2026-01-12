"use client";

import {
    ChevronLeft, Clock, FileText, KeyRound, LayoutDashboard, Loader2, RefreshCw, Users, X
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { ApiError } from '@/services/api';
import { BatchStatus, getBatchStatus } from '@/services/batch';

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((result, index) => (
                  <TableRow key={result.candidate_id || index}>
                    <TableCell className="text-center font-bold">{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-zinc-400" />
                        <span className="font-medium truncate">{result.filename}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-bold">
                      {result.final_score ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {result.hire_signal ? (
                        <Badge variant="outline" className={signalStyles[result.hire_signal]}>
                          {signalLabels[result.hire_signal] || result.hire_signal}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
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
