"use client";

import { CheckCircle, Clock, Sparkles, Users } from "lucide-react";

import { countOrDash, StatTile } from "@/components/evaluation/stat-tile";

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
      <StatTile icon={Users} iconClassName="text-primary" label="Candidates">
        {candidateCount}
      </StatTile>
      {!isProcessing && (
        <StatTile icon={Clock} iconClassName="text-amber-500" label="Proc. Time">
          {processingTimeSeconds ? Math.round(processingTimeSeconds) : "—"}
          <span className="text-xs font-bold text-muted-foreground ml-1 uppercase">
            s
          </span>
        </StatTile>
      )}
      <StatTile icon={Sparkles} iconClassName="text-emerald-500" label="Best Score">
        {bestScore != null ? `${bestScore}%` : "—"}
      </StatTile>
      <StatTile
        icon={CheckCircle}
        iconClassName="text-blue-500"
        label="Top Matches"
        tooltip="Candidates with a Strong Match or Good Match hire signal (≥ 70%)"
      >
        {countOrDash(topMatchCount)}
      </StatTile>
    </div>
  );
}
