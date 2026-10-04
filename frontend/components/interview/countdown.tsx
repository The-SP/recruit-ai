"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn, formatClock } from "@/lib/utils";

/** Amber from here on, so the time pressure builds instead of arriving at once. */
const WARN_AT = 5 * 60;
/** Red, and the server is about to close the interview. */
const URGENT_AT = 60;
/** How long the "5 minutes left" callout stays up after the timer crosses WARN_AT. */
const CALLOUT_SECONDS = 10;

/**
 * Local 1s countdown seeded from the server's time_remaining_seconds; every
 * fresh state fetch or SSE state event re-seeds it. Display only — the server
 * enforces the limit regardless.
 */
export function InterviewCountdown({ seconds }: { seconds: number | null }) {
  const [remaining, setRemaining] = useState(seconds ?? 0);

  // Re-seed on every fresh server value (adjust-state-during-render pattern,
  // the react-hooks lint's preferred alternative to a setState-in-effect).
  const [prevSeconds, setPrevSeconds] = useState(seconds);
  // Fixed at mount: the callout is for watching the timer cross the line, so
  // an interview that is short to begin with (or a refresh with four minutes
  // left) never opens on a warning.
  const [startedAboveWarn] = useState((seconds ?? 0) > WARN_AT);
  if (seconds !== prevSeconds) {
    setPrevSeconds(seconds);
    setRemaining(seconds ?? 0);
  }

  useEffect(() => {
    if (seconds == null) return;
    const interval = setInterval(
      () => setRemaining((r) => Math.max(0, r - 1)),
      1000
    );
    return () => clearInterval(interval);
  }, [seconds]);

  if (seconds == null) return null;

  // Derived from the clock rather than set by a timer, so there is nothing to
  // clean up and a re-seed cannot leave it stuck on.
  const showCallout =
    startedAboveWarn && remaining <= WARN_AT && remaining > WARN_AT - CALLOUT_SECONDS;

  return (
    <span className="inline-flex items-center gap-2">
      <span aria-live="polite" className="contents">
        {showCallout && (
          <span className="rounded-full border border-warning-edge bg-warning px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
            5 minutes left
          </span>
        )}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums transition-colors",
          remaining <= URGENT_AT
            ? "text-error-foreground"
            : remaining <= WARN_AT
              ? "text-warning-foreground"
              : "text-muted-foreground"
        )}
        title="Time remaining"
      >
        <Clock className="w-3.5 h-3.5" />
        {formatClock(remaining)}
      </span>
    </span>
  );
}
