"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Tried in order; the browser's own recorder.mimeType is what gets uploaded,
 * since a browser may normalize what we asked for. WebM/Opus covers
 * Chrome/Edge/Firefox, MP4/AAC covers Safari including iOS >= 14.3. */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function canRecordAudio(): boolean {
  return pickMimeType() !== null && !!navigator.mediaDevices?.getUserMedia;
}

/** Capability never changes for the life of the page, so there is nothing to
 * subscribe to; useSyncExternalStore still needs a subscribe function. */
const subscribeNever = () => () => {};

export type MicStatus = "idle" | "requesting" | "ready" | "denied";

export interface MicStream {
  status: MicStatus;
  /** Live while status === "ready". */
  stream: MediaStream | null;
  isSupported: boolean;
  /** Idempotent: a no-op once a live stream is held, which is what keeps the
   * whole session down to a single permission prompt. Resolves to the stream
   * (null if denied), so a caller can act on it in the same click without
   * waiting for a re-render to deliver `stream`. */
  request: () => Promise<MediaStream | null>;
}

/** Owns the microphone for the whole interview page: the pre-start mic check
 * and the answer recorder share one MediaStream, so the candidate is prompted
 * for permission once rather than once per surface. */
export function useMicStream(): MicStream {
  const [status, setStatus] = useState<MicStatus>("idle");
  // Ref as well as state: `request` must read the current stream without
  // re-creating itself, and the unmount cleanup has no deps of its own.
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Browser capability, not UI state: read through useSyncExternalStore so the
  // server snapshot says "supported" (MediaRecorder never exists there, and
  // hydrating every candidate from an unsupported card would be a lie) and the
  // client re-reads it on mount.
  const isSupported = useSyncExternalStore(subscribeNever, canRecordAudio, () => true);

  const hasLiveStream = () =>
    !!streamRef.current && streamRef.current.getTracks().some((t) => t.readyState === "live");

  const request = useCallback(async () => {
    // The grant is already held; re-calling getUserMedia here is what would
    // produce a second prompt on the browsers that re-ask.
    if (hasLiveStream()) {
      setStatus("ready");
      return streamRef.current;
    }
    setStatus("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = s;
      setStream(s);
      setStatus("ready");
      return s;
    } catch {
      streamRef.current = null;
      setStream(null);
      setStatus("denied");
      return null;
    }
  }, []);

  // Release the mic when the page goes away so the browser's recording
  // indicator clears. Deliberately not tied to the composer's lifetime: the
  // stream has to outlive the pre-start check to reach the interview.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return { status, stream, isSupported, request };
}
