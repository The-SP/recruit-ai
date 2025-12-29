"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
    company_name: string | null;
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
  strong_match: "bg-green-100 text-green-800",
  good_match: "bg-blue-100 text-blue-800",
  partial_match: "bg-amber-100 text-amber-800",
  weak_match: "bg-orange-100 text-orange-800",
  no_match: "bg-red-100 text-red-800",
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

  // Initial fetch only
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

  // No token - show entry form
  if (!token) {
    return (
      <main className="px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-center text-blue-700 mb-3">
          View Results
        </h1>
        <p className="text-center text-zinc-600 mb-10 max-w-md mx-auto">
          Enter your access token to view evaluation results
        </p>

        <Card className="max-w-3xl mx-auto p-6 shadow-sm">
          <form onSubmit={handleTokenSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="token" className="flex items-center gap-2 text-base">
                <KeyRound className="w-5 h-5 text-blue-600" />
                Access Token
              </Label>
              <Input
                id="token"
                placeholder="Paste your token here"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>
            <Button type="submit" className="w-full py-6 text-base cursor-pointer">
              View Results
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  // Loading state
  if (isLoading && !data) {
    return (
      <main className="px-6 py-12 flex flex-col items-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="mt-4 text-zinc-600">Loading...</p>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main className="px-6 py-12">
        <Card className="max-w-md mx-auto p-6 shadow-sm text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link href="/evaluation">
            <Button variant="outline" className="cursor-pointer">
              Try Another Token
            </Button>
          </Link>
        </Card>
      </main>
    );
  }

  if (!data) return null;

  const isProcessing = data.status === "processing" || data.status === "pending";
  const progressPercent = data.progress.total > 0 
    ? (data.progress.processed / data.progress.total) * 100 
    : 0;

  const jobTitle = data.job?.title || "Untitled Position";
  const company = data.job?.company_name;

  return (
    <main className="px-6 py-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-zinc-900">
          {jobTitle}
        </h1>
        {company && <p className="text-zinc-600 mt-1">{company}</p>}
      </div>

      {/* Progress or Results */}
      {isProcessing ? (
        <Card className="p-6 shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-600">Processing resumes...</span>
              <span className="text-zinc-900 font-medium">
                {data.progress.processed} / {data.progress.total}
              </span>
            </div>
            <Progress value={progressPercent} />
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full cursor-pointer"
            >
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh Status
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="flex items-center justify-between text-sm text-zinc-600">
            <span>
              {data.results.length} candidate{data.results.length !== 1 && "s"}
            </span>
            {data.processing_time_seconds && (
              <span>Completed in {Math.round(data.processing_time_seconds)}s</span>
            )}
          </div>

          {/* Results Table */}
          <Card className="shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead className="w-24">Score</TableHead>
                  <TableHead className="w-36">Signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((result, index) => (
                  <TableRow key={result.candidate_id || index}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      {result.candidate_name || result.filename}
                    </TableCell>
                    <TableCell>
                      {result.final_score !== null
                        ? result.final_score.toFixed(2)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {result.hire_signal ? (
                        <Badge className={signalStyles[result.hire_signal] || ""}>
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

          {/* Back link */}
          <div className="text-center">
            <Link href="/">
              <Button variant="outline" className="cursor-pointer">
                ← Submit Another Batch
              </Button>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
