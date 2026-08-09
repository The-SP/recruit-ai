"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A zero-sample WAV. Played during the Start click purely to unlock the audio
 * element under browser autoplay policy — see prime() below.
 */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

export type VoiceStatus = "idle" | "loading" | "playing";

/**
 * Playback for the interviewer's spoken turns.
 *
 * ONE audio element for the whole interview, created up front and reused. That
 * is not an optimization — it is what makes autoplay work. Browsers grant
 * playback permission per element in response to a user gesture, so an element
 * unlocked during the Start click can play every later question without one.
 * A fresh `new Audio()` per turn would be blocked from the second question on,
 * which is exactly the bug this shape avoids.
 *
 * Turns are queued rather than raced: the opening and the first question arrive
 * together, and an interviewer who greets you while asking a question is worse
 * than silence. Playback is strictly sequential, and a fresh turn arriving
 * mid-playback queues behind what is speaking.
 *
 * Nothing here is load-bearing for the interview. Every failure path — blocked
 * autoplay, a failed fetch, synthesis that 503s — degrades to silence, and the
 * question text is on screen the whole time regardless.
 *
 * The clip fetcher arrives as an argument rather than being imported: shared
 * components never call a service, and flow identity (which token, which
 * endpoint) belongs to the page that binds it. That also leaves this hook
 * usable by any surface that wants queued playback, not just the candidate's.
 */
export function useInterviewVoice(
  fetchClip: (key: string) => Promise<Blob>,
  enabled: boolean
) {
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  // key -> object URL. Refetching a clip we already hold would spend a request
  // to get bytes byte-identical to the ones in memory.
  const cacheRef = useRef<Map<string, string>>(new Map());
  const mutedRef = useRef(false);

  useEffect(() => {
    // Captured here rather than read in the cleanup: the Map identity is stable
    // for the hook's life, and reading refs during cleanup is the lint rule's
    // stale-value trap.
    const cache = cacheRef.current;
    const audio = audioRef;
    return () => {
      audio.current?.pause();
      audio.current = null;
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  const element = useCallback(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }, []);

  /**
   * Unlock playback. MUST be called synchronously inside a real user gesture
   * (the Start click) or it buys nothing.
   */
  const prime = useCallback(() => {
    const el = element();
    el.src = SILENT_WAV;
    // Rejection is fine and expected on strict browsers: the manual play
    // buttons remain, and the caller must not treat this as an error.
    void el.play().catch(() => {});
  }, [element]);

  const clipUrl = useCallback(
    async (key: string): Promise<string> => {
      const cached = cacheRef.current.get(key);
      if (cached) return cached;
      const blob = await fetchClip(key);
      const url = URL.createObjectURL(blob);
      cacheRef.current.set(key, url);
      return url;
    },
    [fetchClip]
  );

  const playKey = useCallback(
    async (key: string): Promise<void> => {
      const el = element();
      setActiveKey(key);
      setStatus("loading");
      try {
        const url = await clipUrl(key);
        // Muting can happen while the clip is being fetched, which for a cache
        // miss is several seconds. Re-check before making noise.
        if (mutedRef.current) {
          setStatus("idle");
          setActiveKey(null);
          return;
        }
        el.src = url;
        setStatus("playing");
        await new Promise<void>((resolve) => {
          // `pause` is the one that matters and the easy one to forget: stop()
          // and the mic opening both pause rather than end the clip, and a
          // promise that only settles on `ended` would leave drain() awaiting
          // forever — wedging busyRef and silencing every later question.
          el.onended = () => resolve();
          el.onerror = () => resolve();
          el.onpause = () => resolve();
          el.play().catch(() => resolve());
        });
      } catch {
        // Fetch or synthesis failed. Silence is the correct degradation.
      } finally {
        // Detach, or the next clip's handlers race these and an old resolver
        // can settle the wrong promise.
        el.onended = null;
        el.onerror = null;
        el.onpause = null;
        setStatus("idle");
        setActiveKey(null);
      }
    },
    [clipUrl, element]
  );

  const drain = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      for (;;) {
        const next = queueRef.current.shift();
        if (next === undefined) break;
        if (mutedRef.current) continue; // drop the backlog rather than replay it later
        await playKey(next);
      }
    } finally {
      busyRef.current = false;
    }
  }, [playKey]);

  /** Silence everything: drop the backlog and cut the clip that is speaking. */
  const stop = useCallback(() => {
    queueRef.current = [];
    audioRef.current?.pause();
  }, []);

  /** The one writer for both copies of the mute flag. The ref exists because
   * drain() and playKey() read it outside render, mid-await; the state exists
   * because the header icon renders from it. */
  const applyMuted = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMuted(next);
  }, []);

  /** Queue interviewer turns to be spoken in order. */
  const enqueue = useCallback(
    (keys: (string | null | undefined)[]) => {
      if (!enabled) return;
      const wanted = keys.filter((k): k is string => Boolean(k));
      if (wanted.length === 0) return;
      queueRef.current.push(...wanted);
      void drain();
    },
    [drain, enabled]
  );

  /**
   * Replay one turn on request. Clears anything queued: an explicit click
   * outranks the backlog, and unmutes, because pressing play while muted can
   * only mean the candidate wants to hear it.
   */
  const replay = useCallback(
    (key: string) => {
      if (!enabled) return;
      stop();
      applyMuted(false);
      queueRef.current.push(key);
      void drain();
    },
    [applyMuted, drain, enabled, stop]
  );

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    applyMuted(next);
    if (next) stop();
  }, [applyMuted, stop]);

  return { muted, toggleMute, prime, enqueue, replay, stop, status, activeKey };
}
