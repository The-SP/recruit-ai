"use client";

import { useEffect, useRef } from "react";

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
}: {
  turns: InterviewTurnData[];
  showTyping?: boolean;
  /** Off for static read-back views (e.g. inside a collapsible), where
   * scrolling to the bottom on mount would yank the viewport. */
  autoScroll?: boolean;
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
