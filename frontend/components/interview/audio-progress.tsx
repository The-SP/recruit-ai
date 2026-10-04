"use client";

import { cn, formatClock } from "@/lib/utils";

/** Arrow keys move the playhead by this much. */
const KEY_STEP_SECONDS = 5;

/**
 * Progress bar and time readout for one audio clip, shared by the recruiter's
 * transcript players and the candidate's listen-back.
 *
 * Seeking is offered only when `duration` is known. Browser-recorded WebM has
 * no duration header (Chrome reports Infinity until the clip has played
 * through), so callers pass null until they have a real figure, and the bar
 * then shows progress without pretending to be scrubbable.
 *
 * Tinted from `foreground` rather than a palette token so it reads on any
 * bubble or card it sits in.
 */
export function AudioProgress({
  current,
  duration,
  onSeek,
  className,
}: {
  current: number;
  duration: number | null;
  onSeek?: (seconds: number) => void;
  className?: string;
}) {
  const canSeek = duration !== null && onSeek !== undefined;
  const progress = duration ? Math.min(1, current / duration) : 0;

  const seekTo = (seconds: number) => {
    if (!canSeek) return;
    onSeek(Math.max(0, Math.min(duration, seconds)));
  };

  return (
    <div className={cn("flex items-center gap-3 min-w-0", className)}>
      <div
        role="slider"
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={duration ? Math.round(duration) : undefined}
        aria-valuenow={Math.round(current)}
        aria-valuetext={formatClock(Math.floor(current))}
        aria-disabled={!canSeek}
        tabIndex={canSeek ? 0 : -1}
        onClick={(e) => {
          if (!canSeek) return;
          const rect = e.currentTarget.getBoundingClientRect();
          seekTo(((e.clientX - rect.left) / rect.width) * duration);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            seekTo(current + KEY_STEP_SECONDS);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            seekTo(current - KEY_STEP_SECONDS);
          }
        }}
        // Taller hit area than the visible track, so it is easy to click.
        className={cn(
          "group relative flex h-4 flex-1 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          canSeek && "cursor-pointer"
        )}
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-foreground/15">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/70"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums opacity-80">
        {formatClock(Math.floor(current))}
        {duration !== null && <> / {formatClock(Math.round(duration))}</>}
      </span>
    </div>
  );
}
