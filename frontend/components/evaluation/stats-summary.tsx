"use client";

import { AlertTriangle, CheckCircle, Sparkles, Users } from "lucide-react";

import { countOrDash, StatCell, StatStrip } from "@/components/stat-strip";
import { cn } from "@/lib/utils";

export function StatsSummary({
  candidateCount,
  bestScore,
  topMatchCount,
  failedCount,
  className,
}: {
  candidateCount: number;
  bestScore: number | null;
  topMatchCount: number;
  failedCount: number;
  // Spacing is the caller's: the owned page stacks this in a space-y parent,
  // the anonymous page doesn't.
  className?: string;
}) {
  return (
    // Literal classes for both layouts so Tailwind can see them.
    <StatStrip
      className={cn(
        failedCount > 0 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 sm:grid-cols-3",
        className
      )}
    >
      <StatCell icon={Users} label="Candidates" value={candidateCount} loading={false} />
      <StatCell
        icon={Sparkles}
        label="Best score"
        value={bestScore != null ? `${bestScore}%` : "—"}
        loading={false}
      />
      <StatCell
        icon={CheckCircle}
        label="Top matches"
        value={countOrDash(topMatchCount)}
        tooltip="Candidates rated Strong or Good match (70% or above)"
        loading={false}
      />
      {/* Replaces processing time: a failed resume is something the recruiter
          can act on (retry it), a duration is not. Hidden at zero, like the
          header's "N failed" badge. */}
      {failedCount > 0 && (
        <StatCell
          icon={AlertTriangle}
          label="Failed"
          value={failedCount}
          tone="warn"
          loading={false}
        />
      )}
    </StatStrip>
  );
}
