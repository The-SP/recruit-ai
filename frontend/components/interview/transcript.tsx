"use client";

import { useEffect, useRef } from "react";

import { TurnAudioPlayer } from "@/components/interview/turn-audio-player";
import { cn } from "@/lib/utils";
import type { InterviewTurnData } from "@/lib/interview-types";

/**
 * Chat-style transcript: interviewer on the left, candidate on the right.
 * Purely presentational; the page owns all state.
 */
export function InterviewTranscript({
  turns,
  showTyping = false,
  autoScroll = true,
  onFetchTurnAudio,
}: {
  turns: InterviewTurnData[];
  showTyping?: boolean;
  /** Off for static read-back views (e.g. inside a collapsible), where
   * scrolling to the bottom on mount would yank the viewport. */
  autoScroll?: boolean;
  /** Bound by the owning (recruiter) page to fetch one answer's recording.
   * Omitted on the candidate surface, which never serves audio back. */
  onFetchTurnAudio?: (seq: number) => Promise<Blob>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, showTyping, autoScroll]);

  return (
    <div className="space-y-3">
      {turns.map((turn) => {
        const isCandidate = turn.role === "candidate";
        return (
          <div
            key={turn.seq}
            className={cn("flex", isCandidate ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
                isCandidate
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card border border-border text-foreground rounded-bl-md"
              )}
            >
              {turn.content}
              {isCandidate && turn.has_audio && onFetchTurnAudio && (
                <div className="mt-2 pt-2 border-t border-primary-foreground/20">
                  <TurnAudioPlayer seq={turn.seq} onFetch={onFetchTurnAudio} />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {showTyping && (
        <div className="flex justify-start">
          <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
            <span className="flex gap-1 items-center h-4" aria-label="Interviewer is typing">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
