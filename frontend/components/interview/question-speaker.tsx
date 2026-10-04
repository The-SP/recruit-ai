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
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer",
        playing ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : playing ? (
        <SpeakingBars />
      ) : (
        <Volume2 className="w-3.5 h-3.5" />
      )}
      {loading ? "Loading audio…" : playing ? "Speaking…" : "Play"}
    </button>
  );
}

/** A canned equalizer, not a level meter: the clip plays through a plain
 * audio element, and wiring an analyser into it for a 14px glyph would be
 * machinery for nothing. It only has to say "this one is talking". */
function SpeakingBars() {
  return (
    <span aria-hidden className="flex items-end gap-[2px] h-3.5 w-3.5">
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          className="w-[3px] h-full rounded-full bg-current origin-bottom animate-speaking motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
