import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { scoreBarColor, signalLabels, signalStyles } from "@/lib/evaluation-styles";
import { cn } from "@/lib/utils";

// Illustrative, not a real run: one candidate per hire signal so the preview
// shows the whole scale. Scores sit inside each signal's band (see
// backend/docs/resume-evaluation.md); the demo fixtures only span two signals.
const SAMPLE_JOB_TITLE = "Senior Backend Python Engineer";
const SAMPLE_RESULTS = [
  { name: "John Smith", filename: "john_smith.pdf", score: 0.92, signal: "strong_match" },
  { name: "Priya Sharma", filename: "priya_sharma.pdf", score: 0.78, signal: "good_match" },
  { name: "Michael Johnson", filename: "michael_johnson.pdf", score: 0.63, signal: "partial_match" },
  { name: "Jane Doe", filename: "jane_doe.pdf", score: 0.47, signal: "weak_match" },
  { name: "David Brown", filename: "david_brown.pdf", score: 0.21, signal: "no_match" },
];

/**
 * A static picture of a finished run for the landing hero. It borrows the
 * results table's styles (score bar, hire-signal badge) rather than the table
 * itself: the real one is interactive, and a preview that looks clickable but
 * isn't would mislead.
 */
export function LandingResultsPreview() {
  const results = SAMPLE_RESULTS;

  return (
    <div className="relative isolate max-w-3xl mx-auto text-left">
      {/* Soft brand glow so the card doesn't float on bare black. */}
      <div
        aria-hidden
        className="absolute -inset-x-10 top-10 -bottom-6 -z-10 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden md:shadow-2xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-5 py-4">
          <p className="font-semibold">{SAMPLE_JOB_TITLE}</p>
          <p className="text-sm text-muted-foreground">
            {results.length} candidates ranked
          </p>
        </div>
        <ol className="divide-y">
          {results.map((r, i) => {
            const pct = Math.round(r.score * 100);
            return (
              <li key={r.filename} className="flex items-center gap-3 sm:gap-4 px-5 py-3">
                <span className="w-5 text-center text-sm font-bold">{i + 1}</span>
                <FileText className="hidden sm:block w-5 h-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.filename}</p>
                </div>
                <div className="flex flex-col items-center gap-1.5 w-14 shrink-0">
                  <span className="text-sm font-bold">{pct}%</span>
                  <Progress
                    value={pct}
                    className={cn("h-1 w-12 bg-muted", scoreBarColor(r.score))}
                  />
                </div>
                <Badge
                  variant="outline"
                  className={cn("hidden sm:inline-flex w-28", signalStyles[r.signal])}
                >
                  {signalLabels[r.signal]}
                </Badge>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
