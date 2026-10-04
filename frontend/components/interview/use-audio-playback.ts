"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Play state, position and length for one audio element, shared by the
 * recruiter's transcript players and the candidate's listen-back.
 *
 * Takes the element as a value (state or a callback ref), not a ref object, so
 * the wiring re-runs when the owner creates its element lazily.
 *
 * `autoPlay` starts playback once the length is known, for players whose
 * element only exists because someone just pressed Play.
 */
export function useAudioPlayback(
  element: HTMLAudioElement | null,
  { autoPlay = false }: { autoPlay?: boolean } = {}
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  // Resolves once the length probe is done. Playing before that would let the
  // probe's seek-to-end cut the clip off.
  const readyRef = useRef<Promise<void>>(Promise.resolve());
  // Writes go through a ref: the compiler treats the argument as immutable.
  const elementRef = useRef(element);

  useEffect(() => {
    elementRef.current = element;
    if (!element) return;
    let cancelled = false;
    const onTime = () => setCurrent(element.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrent(0);
    };
    element.addEventListener("timeupdate", onTime);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("ended", onEnded);

    readyRef.current = probeDuration(element).then((d) => {
      if (cancelled) return;
      setDuration(d);
      if (autoPlay) void element.play();
    });

    return () => {
      cancelled = true;
      element.pause();
      element.removeEventListener("timeupdate", onTime);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("ended", onEnded);
    };
  }, [element, autoPlay]);

  const toggle = useCallback(async () => {
    const el = elementRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    await readyRef.current;
    void el.play();
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = elementRef.current;
    if (!el) return;
    el.currentTime = seconds;
    setCurrent(seconds);
  }, []);

  return { isPlaying, current, duration, toggle, seek };
}

/**
 * The element's real length. MediaRecorder WebM carries no duration header, so
 * Chrome reports Infinity until the clip has been read to the end; seeking far
 * past the end makes it scan there and report the true figure, without
 * decoding any audio. Null if the browser never settles on one.
 */
function probeDuration(el: HTMLAudioElement): Promise<number | null> {
  return new Promise((resolve) => {
    let probing = false;
    const finish = () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onChange);
      el.removeEventListener("error", onError);
      if (probing) el.currentTime = 0;
      resolve(Number.isFinite(el.duration) ? el.duration : null);
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration)) return finish();
      probing = true;
      el.currentTime = 1e101;
    };
    const onChange = () => {
      if (probing && Number.isFinite(el.duration)) finish();
    };
    const onError = () => finish();

    el.addEventListener("durationchange", onChange);
    el.addEventListener("error", onError);
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) onMeta();
    else el.addEventListener("loadedmetadata", onMeta);
  });
}
