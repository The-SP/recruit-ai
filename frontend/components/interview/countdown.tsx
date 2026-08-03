"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

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

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums",
        remaining <= 60 ? "text-error-foreground" : "text-muted-foreground"
      )}
      title="Time remaining"
    >
      <Clock className="w-3.5 h-3.5" />
      {mm}:{ss}
    </span>
  );
}
