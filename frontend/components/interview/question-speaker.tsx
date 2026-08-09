"use client";

import { Loader2, Volume2 } from "lucide-react";

import type { VoiceStatus } from "@/components/interview/use-interview-voice";
import { cn } from "@/lib/utils";

/**
 * Replay control for one spoken interviewer turn, beside its text.
 *
 * Purely presentational: playback is owned by the page's useInterviewVoice
 * hook, because only one thing may speak at a time and turns play in order.
 * This is a button, not a player — which is also why the shared transcript can
 * render it without knowing anything about the voice pipeline.
 *
 * There is no error state on purpose. A clip that fails to load leaves the
 * question on screen and the button ready to try again; surfacing "audio
 * failed" would tell the candidate about a problem that does not affect
 * anything they need to do.
 */
export function QuestionSpeaker({
  voiceKey,
  status,
  isActive,
  onReplay,
}: {
  voiceKey: string;
  /** Playback state of the interview's single audio element. */
  status: VoiceStatus;
  /** Whether that state refers to this turn rather than another one. */
  isActive: boolean;
  onReplay: (key: string) => void;
}) {
  const loading = isActive && status === "loading";
  const playing = isActive && status === "playing";

  return (
    <button
      type="button"
      onClick={() => onReplay(voiceKey)}
      aria-label={playing ? "Playing question" : "Play question aloud"}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Volume2 className={cn("w-3.5 h-3.5", playing && "text-primary")} />
      )}
      {loading ? "Loading audio…" : playing ? "Playing…" : "Play"}
    </button>
  );
}
