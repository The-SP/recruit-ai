"use client";

import { CheckCircle, Clock, Sparkles, Users } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function StatsSummary({
  candidateCount,
  processingTimeSeconds,
  bestScore,
  topMatchCount,
  isProcessing,
}: {
  candidateCount: number;
  processingTimeSeconds: number | null;
  bestScore: number | null;
  topMatchCount: number;
  isProcessing: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
      <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2 text-xs font-semibold">
          <Users className="w-3.5 h-3.5 text-primary" />
          Candidates
        </div>
        <div className="text-3xl font-black text-foreground">{candidateCount}</div>
      </div>
      {!isProcessing && (
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Proc. Time
          </div>
          <div className="text-3xl font-black text-foreground">
            {processingTimeSeconds ? Math.round(processingTimeSeconds) : "—"}
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
  );
}
