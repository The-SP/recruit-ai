"use client";

import { Bot } from "lucide-react";
import type { ReactNode } from "react";

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
  onFetchTurnAudio,
  renderQuestionAudio,
  variant = "live",
  activeSeq = null,
}: {
  turns: InterviewTurnData[];
  showTyping?: boolean;
  /** Bound by the owning (recruiter) page to fetch one answer's recording.
   * Omitted on the candidate surface, which never serves audio back. */
  onFetchTurnAudio?: (seq: number) => Promise<Blob>;
  /** The control that plays one interviewer turn aloud, supplied by the owning
   * page. A render slot rather than a set of props because the two surfaces
   * play questions genuinely differently -- the recruiter clicks independent
   * clips, the candidate gets sequential autoplay from one shared element --
   * and threading either one's playback state through here would put a flow's
   * internals inside a component both flows share. */
  renderQuestionAudio?: (turn: InterviewTurnData) => ReactNode;
  /** "live" is the candidate's chat: answers in brand green, no labels.
   * "review" is the recruiter's read-back: neutral answer bubbles (green is
   * the page's primary action, not a speaker) and a speaker line on each turn
   * so a long transcript can be scanned by question. */
  variant?: "live" | "review";
  /** The interviewer turn the candidate is answering right now, drawn
   * stronger than the turns around it. Live variant only; null when nothing
   * is awaiting an answer. */
  activeSeq?: number | null;
}) {
  const isReview = variant === "review";

  return (
    <div className="space-y-3">
      {turns.map((turn) => {
        const isCandidate = turn.role === "candidate";
        return (
          <div
            key={turn.seq}
            className={cn(
              "flex flex-col gap-1",
              isCandidate ? "items-end" : "items-start"
            )}
          >
            {!isReview && !isCandidate && (
              <span className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-muted-foreground">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted">
                  <Bot className="w-2.5 h-2.5" />
                </span>
                {speakerLabel(turn, "live")}
              </span>
            )}
            {isReview && (
              <span
                className={cn(
                  "px-1 text-[11px] font-semibold",
                  // Speaker hues, not status colours: green, red and amber
                  // already mean action, broken and waiting. Palette pairs
                  // rather than the -foreground tokens, which are tuned for
                  // badge fills and wash out on a light page.
                  isCandidate
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-violet-600 dark:text-violet-400"
                )}
              >
                {speakerLabel(turn, "review")}
              </span>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
                isCandidate
                  ? isReview
                    ? "bg-muted text-foreground rounded-br-md"
                    : "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card border border-border text-foreground rounded-bl-md",
                // Neutral emphasis, not green: this marks what is selected,
                // and green is reserved for the action.
                turn.seq === activeSeq && "border-foreground/30 shadow-md text-[15px]"
              )}
            >
              {turn.content}
              {isCandidate && turn.has_audio && onFetchTurnAudio && (
                <div
                  className={cn(
                    "mt-2 pt-2 border-t",
                    isReview ? "border-border" : "border-primary-foreground/20"
                  )}
                >
                  <TurnAudioPlayer onFetch={() => onFetchTurnAudio(turn.seq)} />
                </div>
              )}
              {/* Block-level wrapper, not an inline control: the bubble is
                  whitespace-pre-wrap, so an inline button flows into the last
                  line of the question and sits on top of the text. */}
              {!isCandidate && turn.voice_key && renderQuestionAudio && (
                <div className="mt-2 pt-2 border-t border-border/60">
                  {renderQuestionAudio(turn)}
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
    </div>
  );
}

/** The candidate reads "Question 2"; the recruiter scans "Q2" down a long
 * read-back, where follow-ups also carry their question number. */
function speakerLabel(turn: InterviewTurnData, variant: "live" | "review"): string {
  if (turn.role === "candidate") return "Candidate";
  const n = turn.question_index !== null ? turn.question_index + 1 : null;
  const live = variant === "live";
  if (turn.kind === "question" && n !== null)
    return `Interviewer · ${live ? `Question ${n}` : `Q${n}`}`;
  if (turn.kind === "followup" && (live || n !== null))
    return live ? "Interviewer · Follow-up" : `Interviewer · Q${n} follow-up`;
  return "Interviewer";
}
