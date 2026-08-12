"use client";

import { Loader2, Mic, MicOff, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pickMimeType, type MicStream } from "@/components/interview/use-mic-stream";
import { formatClock } from "@/lib/utils";

/** The sample only has to prove the mic works; it is never uploaded, so there
 * is no reason to let it run as long as a real answer. */
const MAX_SAMPLE_SECONDS = 8;

/** The one copy of the blocked-microphone instructions. Rendered both here,
 * before the interview starts, and by the answer recorder for candidates who
 * skipped this check — the wording must not diverge between the two. */
export function MicPermissionDenied({ onRetry }: { onRetry: () => void }) {
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
      <Button onClick={onRetry} className="h-11 px-6 font-bold rounded-xl cursor-pointer">
        Try again
      </Button>
    </Card>
  );
}

interface HeldSample {
  url: string;
}

type CheckState = "ready" | "recording" | "recorded";

interface MicCheckProps {
  mic: MicStream;
  /** Questions are read aloud, so the playback doubles as a speaker check and
   * the copy should say so. */
  voiceMode: boolean;
}

/** Optional pre-start check: record a few seconds and play them back. Catches
 * the failures a level meter cannot — an OS-level mute, the wrong input device,
 * a webcam mic too far away — while the clock is not yet running. Entirely
 * local: no upload, no endpoint, no transcription. */
export function MicCheck({ mic, voiceMode }: MicCheckProps) {
  const [checkState, setCheckState] = useState<CheckState>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [sample, setSample] = useState<HeldSample | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    autoStopRef.current = null;
    tickRef.current = null;
  }, []);

  // Updater form so it revokes whatever URL is current rather than one captured
  // at definition time, which is also what makes it safe to call from unmount.
  const releaseSample = useCallback(() => {
    setSample((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      releaseSample();
      // Deliberately not stopping mic.stream: the page owns it and it has to
      // survive into the interview.
    };
  }, [clearTimers, releaseSample]);

  const startSample = () => {
    const stream = mic.stream;
    const mimeType = pickMimeType();
    if (!stream || !mimeType) {
      mic.request();
      return;
    }

    releaseSample();
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTimers();
      // recorder.mimeType, not the requested string: the browser may normalize
      // it, and the <audio> element plays back whatever it actually produced.
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
      chunksRef.current = [];
      setSample({ url: URL.createObjectURL(blob) });
      setCheckState("recorded");
    };

    recorder.start();
    setElapsed(0);
    setCheckState("recording");

    tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    autoStopRef.current = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, MAX_SAMPLE_SECONDS * 1000);
  };

  const stopSample = () => {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
  };

  // The answer recorder shows its own unsupported card at answer time, which is
  // the right place for it; nothing useful to offer here.
  if (!mic.isSupported) return null;

  if (mic.status === "denied") {
    return <MicPermissionDenied onRetry={mic.request} />;
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-5 space-y-4">
      <div className="space-y-1.5">
        <p className="font-bold text-foreground text-sm">Check your microphone</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Record a few seconds and play it back, so you find any problem now rather
          than mid-interview.
          {voiceMode
            ? " It checks your speakers too — the questions are read aloud, so if you can't hear the playback you won't hear the interviewer."
            : ""}{" "}
          This is optional, and nothing is uploaded or saved.
        </p>
      </div>

      {mic.status !== "ready" && (
        <Button
          onClick={mic.request}
          variant="outline"
          disabled={mic.status === "requesting"}
          className="h-11 px-5 font-bold rounded-xl cursor-pointer"
        >
          {mic.status === "requesting" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Waiting for permission...
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 mr-2" />
              Test your microphone
            </>
          )}
        </Button>
      )}

      {mic.status === "ready" && checkState === "ready" && (
        <Button
          onClick={startSample}
          variant="outline"
          className="h-11 px-5 font-bold rounded-xl cursor-pointer"
        >
          <Mic className="w-4 h-4 mr-2" />
          {sample ? "Record again" : "Record a test clip"}
        </Button>
      )}

      {checkState === "recording" && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-3 h-3 rounded-full bg-error-foreground animate-pulse shrink-0" />
            <span className="font-mono font-bold text-foreground tabular-nums">
              {formatClock(elapsed)}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              Say a few words
            </span>
          </div>
          <Button
            onClick={stopSample}
            variant="outline"
            className="h-11 px-5 font-bold rounded-xl shrink-0 cursor-pointer"
          >
            <Square className="w-4 h-4 mr-2" />
            Stop
          </Button>
        </div>
      )}

      {checkState === "recorded" && sample && (
        <div className="space-y-3">
          <audio src={sample.url} controls className="w-full" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Can you hear yourself clearly? If not, check your input device and
              volume before starting.
            </p>
            <Button
              onClick={() => {
                releaseSample();
                setCheckState("ready");
              }}
              variant="outline"
              className="h-11 px-5 font-bold rounded-xl shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Record again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
