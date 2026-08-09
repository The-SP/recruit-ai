"use client";

import { AlertCircle, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current === playingElement) playingElement = null;
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const attach = (element: HTMLAudioElement) => {
    element.onended = () => setIsPlaying(false);
    element.onpause = () => setIsPlaying(false);
    element.onplay = () => {
      if (playingElement && playingElement !== element) playingElement.pause();
      playingElement = element;
      setIsPlaying(true);
    };
  };

  const toggle = async () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else void audioRef.current.play();
      return;
    }

    setState("loading");
    try {
      const blob = await onFetch();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const element = new Audio(url);
      attach(element);
      audioRef.current = element;
      setState("idle");
      void element.play();
    } catch {
      setState("error");
    }
  };

  if (state === "error") {
    return (
      <button
        type="button"
        onClick={() => {
          setState("idle");
          void toggle();
        }}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold opacity-90 hover:opacity-100 cursor-pointer"
      >
        <AlertCircle className="w-3.5 h-3.5" />
        Couldn&apos;t load audio — retry
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "loading"}
      aria-label={isPlaying ? `Pause: ${label}` : label}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold opacity-80 hover:opacity-100 disabled:opacity-50 cursor-pointer"
    >
      {state === "loading" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isPlaying ? (
        <Pause className="w-3.5 h-3.5" />
      ) : (
        <Play className="w-3.5 h-3.5" />
      )}
      {isPlaying ? "Pause" : label}
    </button>
  );
}
