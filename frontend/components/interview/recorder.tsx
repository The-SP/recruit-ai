"use client";

import { Loader2, Mic, MicOff, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AudioLevelBars } from "@/components/interview/audio-level-bars";
import { MicPermissionDenied } from "@/components/interview/mic-check";
import { pickMimeType, type MicStream } from "@/components/interview/use-mic-stream";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { formatClock } from "@/lib/utils";

/** Mirrors MAX_ANSWER_AUDIO_SECONDS in backend/app/interview/constants.py. The
 * server bounds bytes rather than duration, so this is the cap that actually
 * stops a candidate from rambling past the design; keep the two in step. */
const MAX_SECONDS = 180;

/** Warn the candidate this many seconds before the auto-stop. */
const WARN_AT_REMAINING = 30;

/** Stopping is disabled this long after recording starts. There is one take
 * per question and stopping sends, so a double-pressed Space would otherwise
 * submit an empty answer with no way back. */
const MIN_SECONDS = 2;

/** `failed` holds the recording after a submit that did not go through; Retry
 * re-sends it. There is no state for reviewing a recording before it is sent. */
type RecorderState = "ready" | "recording" | "submitting" | "failed";

interface AnswerRecorderProps {
  /** The page-owned microphone. Shared with the pre-start check so a candidate
   * who tested their mic is never prompted for permission a second time. */
  mic: MicStream;
  /** Uploads the recording. Resolves to an error message, or null on success.
   * The recorder keeps the blob on failure so Retry re-sends the same audio
   * instead of making the candidate speak again. */
  onSubmit: (blob: Blob) => Promise<string | null>;
  /** Fired the moment capture begins. The page uses it to silence the spoken
   * question: an open mic with the interviewer still talking records the
   * interviewer, and that audio is transcribed into the candidate's answer. */
  onRecordingStart?: () => void;
}

/**
 * One take per question, like a live interview: stopping sends the answer, and
 * there is no listen-back or re-record. A rehearsed second take tells a
 * recruiter less than the first, and the pre-start mic check already covers
 * "is my microphone working?".
 */
export function AnswerRecorder({ mic, onSubmit, onRecordingStart }: AnswerRecorderProps) {
  const [uiState, setUiState] = useState<RecorderState>("ready");
  const [elapsed, setElapsed] = useState(0);
  // The last submit's error, shown above the Retry button.
  const [message, setMessage] = useState<string | null>(null);
  // Only held while a failed submit waits for Retry.
  const [failedBlob, setFailedBlob] = useState<Blob | null>(null);

  // Refs, not state: none of these should trigger a render, and the recorder
  // callbacks need to read the current value rather than a captured one.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The recorder's onstop sends the answer, and it is bound when recording
  // starts. Reading onSubmit through a ref sends with the page's current
  // state (the after_seq), not the one captured minutes earlier.
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  });

  const clearTimers = useCallback(() => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    autoStopRef.current = null;
    tickRef.current = null;
  }, []);

  // The mic itself belongs to the page (`useMicStream`), which keeps it alive
  // across turns and across the pre-start check: one permission prompt per
  // interview, not one per question. Only this component's own timers and
  // recorder are torn down here.
  useEffect(() => {
    return () => {
      clearTimers();
      // Stopping the stream used to end an in-flight recorder implicitly; now
      // that the stream outlives this component, stop the recorder explicitly.
      // Detach onstop first: it sends, and an unmount (the interview ending,
      // or navigating away) must discard a half-recorded answer, not submit it.
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      chunksRef.current = [];
    };
  }, [clearTimers]);

  const send = async (blob: Blob) => {
    setUiState("submitting");
    setMessage(null);
    const error = await onSubmitRef.current(blob);

    if (error) {
      // Keep the recording: Retry re-sends this exact audio rather than
      // making the candidate speak again.
      setFailedBlob(blob);
      setMessage(error);
      setUiState("failed");
      return;
    }

    setFailedBlob(null);
    setUiState("ready");
  };

  const startRecording = () => {
    const stream = mic.stream;
    const mimeType = pickMimeType();
    if (!stream || !mimeType) {
      mic.request();
      return;
    }

    // Before the recorder opens, not after: anything still playing would be
    // captured by the mic and transcribed as if the candidate had said it.
    onRecordingStart?.();

    setFailedBlob(null);
    setMessage(null);
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
      chunksRef.current = [];
      void send(blob);
    };

    recorder.start();
    setElapsed(0);
    setUiState("recording");

    tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    autoStopRef.current = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, MAX_SECONDS * 1000);
  };

  const canStop = elapsed >= MIN_SECONDS;

  const stopRecording = () => {
    if (!canStop) return;
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
  };

  // No deps: re-subscribing each render keeps the handler on current state,
  // and renders here are at most once a second.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.key !== " ") return;
      // A focused control already handles its own keys (Space presses a
      // button, types into a field); acting here as well would fire twice.
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, textarea, select, a, audio, [contenteditable]")) return;

      if (uiState === "ready") {
        e.preventDefault();
        startRecording();
      } else if (uiState === "recording") {
        e.preventDefault();
        stopRecording();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!mic.isSupported) {
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

  if (mic.status === "denied") {
    return <MicPermissionDenied onRetry={mic.request} />;
  }

  // Never reached by a candidate who ran the pre-start check — this is the path
  // for one who skipped it, or whose grant was revoked mid-session.
  if (mic.status !== "ready") {
    return (
      <Card className="p-6 rounded-2xl border-border/60 space-y-3">
        <p className="text-sm text-muted-foreground">
          Answers are spoken. Enable your microphone to begin recording.
        </p>
        <Button
          onClick={mic.request}
          disabled={mic.status === "requesting"}
          className="h-11 px-6 font-bold rounded-xl cursor-pointer"
        >
          {mic.status === "requesting" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Waiting for permission...
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 mr-2" />
              Enable microphone
            </>
          )}
        </Button>
      </Card>
    );
  }

  const remaining = MAX_SECONDS - elapsed;

  return (
    <div className="space-y-3 pb-2">
      {message && (
        <ErrorBanner>{message}</ErrorBanner>
      )}

      <Card className="p-6 rounded-2xl border-border/60">
        {uiState === "ready" && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Answer out loud. You get one take, and stopping sends your answer.
              <span className="hidden sm:inline">
                {" "}Press <Kbd>Space</Kbd> to start.
              </span>
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
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="w-3 h-3 rounded-full bg-error-foreground animate-pulse shrink-0" />
              <span className="font-mono font-bold text-foreground tabular-nums">
                {formatClock(elapsed)}
              </span>
              {/* Live input level: a flat line here means the mic is not
                  hearing them, which is worth knowing before they finish. */}
              {mic.stream && (
                <AudioLevelBars stream={mic.stream} className="flex-1 min-w-0 h-6" />
              )}
            </div>
            <Button
              onClick={stopRecording}
              disabled={!canStop}
              className="h-11 px-6 font-bold rounded-xl shrink-0 cursor-pointer"
            >
              Done answering
              <Send className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {uiState === "recording" && (
          <p className="mt-3 text-xs text-muted-foreground">
            {remaining <= WARN_AT_REMAINING ? (
              <span className="font-semibold text-warning-foreground">
                {remaining}s left. Your answer sends automatically.
              </span>
            ) : (
              <>
                Recording your answer.
                <span className="hidden sm:inline">
                  {" "}Press <Kbd>Space</Kbd> when you&apos;re done.
                </span>
              </>
            )}
          </p>
        )}

        {uiState === "failed" && failedBlob && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Your recording is saved. Send it again to continue.
            </p>
            <Button
              onClick={() => void send(failedBlob)}
              className="h-11 px-6 font-bold rounded-xl shrink-0 cursor-pointer"
            >
              Retry
              <Send className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {uiState === "submitting" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            {/* One state on purpose: the upload and the transcription are two
                server steps the client can't tell apart, and pretending
                otherwise would show a progress story that isn't true. */}
            <span className="font-medium">Sending your answer...</span>
          </div>
        )}
      </Card>
    </div>
  );
}
