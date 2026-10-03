"use client";

import { Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Run-level progress while resumes are scoring. Framed like StatStrip so it
 * sits in the same visual family as the stats it precedes; the per-candidate
 * view is the pending rows in ResultsTable.
 */
export function ProcessingProgress({
  processed,
  total,
  failed,
  percent,
  className,
}: {
  processed: number;
  total: number;
  failed: number;
  percent: number;
  className?: string;
}) {
  const started = processed > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("bg-card border rounded-2xl shadow-sm px-5 py-3.5", className)}
    >
      {/* One row: label, bar, count. On phones the bar drops to its own line
          beneath the other two. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <p className="flex items-center gap-2 font-medium shrink-0">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          Scoring resumes
        </p>
        {/* Before the first resume lands there is no progress to draw; a
            pulsing track says "working" where an empty bar reads as stuck. */}
        <Progress
          value={percent}
          aria-label="Scoring progress"
          className={cn(
            "h-1.5 bg-muted flex-1 min-w-24 max-sm:order-last max-sm:basis-full",
            !started && "animate-pulse"
          )}
        />
        <p className="text-muted-foreground tabular-nums shrink-0 ml-auto">
          {processed} of {total} scored
          {failed > 0 && <span className="text-destructive"> · {failed} failed</span>}
        </p>
      </div>
      {/* Only while the card is alone on the page. Once rows are scoring,
          their "Scoring…" lines say the same thing. */}
      {!started && (
        <p className="text-xs text-muted-foreground mt-2.5">
          Results appear below as each resume finishes. You can leave this page;
          scoring continues in the background.
        </p>
      )}
    </div>
  );
}
