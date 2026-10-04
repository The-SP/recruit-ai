"use client";

import { AlertCircle, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AudioProgress } from "@/components/interview/audio-progress";
import { useAudioPlayback } from "@/components/interview/use-audio-playback";
import { cn } from "@/lib/utils";

/** The element currently playing, so starting one answer pauses another.
 * Module scope rather than context: every player on the page is inside the
 * same transcript, and a provider for one boolean would be ceremony. */
let playingElement: HTMLAudioElement | null = null;

type PlayerState = "idle" | "loading" | "error";

/**
 * Click-to-play control for one clip beside its transcript line.
 *
 * Serves both directions of interview audio on the recruiter surface: a
 * candidate's recorded answer, and the interviewer's spoken question. Both are
 * opt-in per turn — the transcript stays the reading surface — and both fetch
 * lazily on first play, then cache for as long as the control is mounted.
 * Until that first play it is a compact button, so a long transcript doesn't
 * draw a bar per turn or fetch anything up front; once loaded it grows a
 * progress bar the recruiter can click to jump to a word they want to check.
 *
 * The candidate's own surface does NOT use this for questions: there, playback
 * is sequential and auto-starting, which needs the single shared element in
 * useInterviewVoice. Here every clip is an independent click.
 */
export function TurnAudioPlayer({
  onFetch,
  label = "Play recording",
}: {
  /** Bound by the owning page; the shared transcript never calls a service. */
  onFetch: () => Promise<Blob>;
  label?: string;
}) {
  const [state, setState] = useState<PlayerState>("idle");
  // Created on the first click and kept: it doubles as the fetch cache. Its
  // existence is also what switches the control to the full player.
  const [element, setElement] = useState<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  // Only ever created by a click on Play, so it always starts playing.
  const { isPlaying, current, duration, toggle, seek } = useAudioPlayback(element, {
    autoPlay: true,
  });

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!element) return;
    const claim = () => {
      if (playingElement && playingElement !== element) playingElement.pause();
      playingElement = element;
    };
    element.addEventListener("play", claim);
    return () => {
      element.removeEventListener("play", claim);
      if (playingElement === element) playingElement = null;
    };
  }, [element]);

  const load = async () => {
    setState("loading");
    try {
      const blob = await onFetch();
      urlRef.current = URL.createObjectURL(blob);
      setElement(new Audio(urlRef.current));
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const ready = element !== null;

  if (state === "error") {
    return (
      <button
        type="button"
        onClick={() => {
          void load();
        }}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold opacity-90 hover:opacity-100 cursor-pointer"
      >
        <AlertCircle className="w-3.5 h-3.5" />
        Couldn&apos;t load audio — retry
      </button>
    );
  }

  const button = (
    <button
      type="button"
      onClick={ready ? toggle : load}
      disabled={state === "loading"}
      aria-label={isPlaying ? `Pause: ${label}` : label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold opacity-80 hover:opacity-100 disabled:opacity-50 cursor-pointer",
        // Fixed width once the bar is beside it, so Play/Pause doesn't nudge it.
        ready && "w-14"
      )}
    >
      {state === "loading" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isPlaying ? (
        <Pause className="w-3.5 h-3.5" />
      ) : (
        <Play className="w-3.5 h-3.5" />
      )}
      {ready ? (isPlaying ? "Pause" : "Play") : label}
    </button>
  );

  if (!ready) return button;

  return (
    <div className="flex items-center gap-3">
      {button}
      <AudioProgress current={current} duration={duration} onSeek={seek} className="flex-1" />
    </div>
  );
}
