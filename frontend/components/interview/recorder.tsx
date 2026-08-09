"use client";

import { AlertCircle, Loader2, Mic, MicOff, RotateCcw, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatClock } from "@/lib/utils";

/** Mirrors MAX_ANSWER_AUDIO_SECONDS in backend/app/interview/constants.py. The
 * server bounds bytes rather than duration, so this is the cap that actually
 * stops a candidate from rambling past the design; keep the two in step. */
const MAX_SECONDS = 180;

/** Warn the candidate this many seconds before the auto-stop. */
const WARN_AT_REMAINING = 30;

/** Tried in order; the browser's own recorder.mimeType is what gets uploaded,
 * since a browser may normalize what we asked for. WebM/Opus covers
 * Chrome/Edge/Firefox, MP4/AAC covers Safari including iOS >= 14.3. */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

type RecorderState =
  | "permission_needed"
  | "permission_denied"
  | "ready"
  | "recording"
  | "recorded"
  | "submitting";

/** The recording currently held, and the object URL rendering it. Kept as one
 * value so the URL can never outlive the blob it points at. */
interface HeldRecording {
  blob: Blob;
  url: string;
}

interface AnswerRecorderProps {
  /** Uploads the recording. Resolves to an error message, or null on success.
   * The recorder keeps the blob on failure so Retry re-sends the same audio
   * instead of making the candidate speak again. */
  onSubmit: (blob: Blob) => Promise<string | null>;
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

function canRecordAudio(): boolean {
  return pickMimeType() !== null && !!navigator.mediaDevices?.getUserMedia;
}

/** Capability never changes for the life of the page, so there is nothing to
 * subscribe to; useSyncExternalStore still needs a subscribe function. */
const subscribeNever = () => () => {};

export function AnswerRecorder({ onSubmit }: AnswerRecorderProps) {
  const [uiState, setUiState] = useState<RecorderState>("permission_needed");
  const [elapsed, setElapsed] = useState(0);
  // Non-null means the last submit failed; it is also what turns the submit
  // button into Retry, so there is no separate "error" ui state.
  const [message, setMessage] = useState<string | null>(null);
  const [recording, setRecording] = useState<HeldRecording | null>(null);

  // Refs, not state: none of these should trigger a render, and the recorder
  // callbacks need to read the current value rather than a captured one.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Browser capability, not UI state: read through useSyncExternalStore so the
  // server snapshot says "supported" (MediaRecorder never exists there, and
  // hydrating every candidate from an unsupported card would be a lie) and the
  // client re-reads it on mount.
  const isSupported = useSyncExternalStore(
    subscribeNever,
    canRecordAudio,
    () => true
  );

  const clearTimers = useCallback(() => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    autoStopRef.current = null;
    tickRef.current = null;
  }, []);

  // Updater form, so it revokes whatever URL is current rather than one
  // captured at definition time — this is also what makes it safe to call from
  // the unmount cleanup below, which has no deps of its own.
  const releaseRecording = useCallback(() => {
    setRecording((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    chunksRef.current = [];
  }, []);

  // Release the mic on unmount so the browser's recording indicator goes away.
  // The stream is otherwise kept alive across turns: one permission prompt per
  // interview, not one per question.
  useEffect(() => {
    return () => {
      clearTimers();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      releaseRecording();
    };
  }, [clearTimers, releaseRecording]);

  const requestMic = async () => {
    setMessage(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      setUiState("ready");
    } catch {
      setUiState("permission_denied");
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    const mimeType = pickMimeType();
    if (!stream || !mimeType) {
      setUiState("permission_needed");
      return;
    }

    releaseRecording();
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTimers();
      // recorder.mimeType, not the requested string: the browser may normalize
      // it, and blob.type is what the upload sends and the server validates.
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || mimeType,
      });
      // Drop the chunks now: otherwise they and the combined blob both stay
      // alive through the whole review-and-submit window.
      chunksRef.current = [];
      setRecording({ blob, url: URL.createObjectURL(blob) });
      setUiState("recorded");
    };

    recorder.start();
    setElapsed(0);
    setUiState("recording");

    tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    autoStopRef.current = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, MAX_SECONDS * 1000);
  };

  const stopRecording = () => {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
  };

  const reRecord = () => {
    releaseRecording();
    setMessage(null);
    setUiState("ready");
  };

  const submit = async () => {
    if (!recording) return;

    setUiState("submitting");
    setMessage(null);
    const error = await onSubmit(recording.blob);

    if (error) {
      // Keep the recording and stay in `recorded`: Retry re-sends this exact
      // audio rather than making the candidate speak again.
      setMessage(error);
      setUiState("recorded");
      return;
    }

    releaseRecording();
    setUiState("ready");
  };

  if (!isSupported) {
    return (
      <Card className="p-6 rounded-2xl border-error-edge bg-error/40 space-y-2">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <MicOff className="w-4 h-4" />
          This browser can&apos;t record audio
        </div>
        <p className="text-sm text-muted-foreground">
          This interview is answered out loud. Please reopen your invite link in a
          current version of Chrome, Edge, Firefox, or Safari.
        </p>
      </Card>
    );
  }

  if (uiState === "permission_denied") {
    return (
      <Card className="p-6 rounded-2xl border-error-edge bg-error/40 space-y-3">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <MicOff className="w-4 h-4" />
          Microphone access is blocked
        </div>
        <p className="text-sm text-muted-foreground">
          This interview is answered out loud. Allow the microphone for this site —
          click the icon at the left of the address bar, choose Site settings, and set
          Microphone to Allow — then try again.
        </p>
        <Button onClick={requestMic} className="h-11 px-6 font-bold rounded-xl cursor-pointer">
          Try again
        </Button>
      </Card>
    );
  }

  if (uiState === "permission_needed") {
    return (
      <Card className="p-6 rounded-2xl border-border/60 space-y-3">
        <p className="text-sm text-muted-foreground">
          Answers are spoken. Enable your microphone to begin recording.
        </p>
        <Button
          onClick={requestMic}
          className="h-11 px-6 font-bold rounded-xl cursor-pointer"
        >
          <Mic className="w-4 h-4 mr-2" />
          Enable microphone
        </Button>
      </Card>
    );
  }

  const remaining = MAX_SECONDS - elapsed;

  return (
    <div className="space-y-3 pb-2">
      {message && (
        <div className="bg-error border border-error-edge text-error-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="font-medium">{message}</p>
        </div>
      )}

      <Card className="p-6 rounded-2xl border-border/60">
        {uiState === "ready" && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Speak your answer, then stop when you&apos;re done. You can listen back
              and re-record before submitting.
            </p>
            <Button
              onClick={startRecording}
              className="h-11 px-6 font-bold rounded-xl shrink-0 cursor-pointer"
            >
              <Mic className="w-4 h-4 mr-2" />
              Record
            </Button>
          </div>
        )}

        {uiState === "recording" && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-3 h-3 rounded-full bg-error-foreground animate-pulse shrink-0" />
              <span className="font-mono font-bold text-foreground tabular-nums">
                {formatClock(elapsed)}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {remaining <= WARN_AT_REMAINING
                  ? `${remaining}s left — recording stops automatically`
                  : "Recording your answer"}
              </span>
            </div>
            <Button
              onClick={stopRecording}
              variant="outline"
              className="h-11 px-6 font-bold rounded-xl shrink-0 cursor-pointer"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          </div>
        )}

        {uiState === "recorded" && recording && (
          <div className="space-y-4">
            <audio src={recording.url} controls className="w-full" />
            <div className="flex items-center justify-between gap-3">
              <Button
                onClick={reRecord}
                variant="outline"
                className="h-11 px-5 font-bold rounded-xl cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Re-record
              </Button>
              <Button
                onClick={submit}
                className="h-11 px-6 font-bold rounded-xl cursor-pointer"
              >
                {message ? "Retry" : "Done answering"}
                <Send className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {uiState === "submitting" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            {/* One state on purpose: the upload and the transcription are two
                server steps the client can't tell apart, and pretending
                otherwise would show a progress story that isn't true. */}
            <span className="font-medium">Transcribing your answer...</span>
          </div>
        )}
      </Card>
    </div>
  );
}
