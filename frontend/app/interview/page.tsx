"use client";

import {
  CheckCircle2,
  KeyRound,
  ListChecks,
  Loader2,
  MessageSquareText,
  Mic,
  Send,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { InterviewCountdown } from "@/components/interview/countdown";
import { MicCheck } from "@/components/interview/mic-check";
import { QuestionSpeaker } from "@/components/interview/question-speaker";
import { AnswerRecorder } from "@/components/interview/recorder";
import { InterviewTranscript } from "@/components/interview/transcript";
import { useInterviewVoice } from "@/components/interview/use-interview-voice";
import { useMicStream } from "@/components/interview/use-mic-stream";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type {
  InterviewState,
  InterviewStateEvent,
  InterviewTurnData,
} from "@/lib/interview-types";
import { ApiError } from "@/services/api";
import {
  fetchVoiceClip,
  getInterviewState,
  startInterview,
  submitAnswer,
  submitAudioAnswer,
} from "@/services/interview";

const MAX_ANSWER_LENGTH = 5000;

function InterviewPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<InterviewState | null>(null);
  const [isLoading, setIsLoading] = useState(!!token);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState("");

  // Voice is read from the interview's own snapshot, never a build-time flag.
  // The fetcher is bound here so the shared hook stays free of the token and
  // of any service import.
  const fetchClip = useCallback(
    (key: string) => fetchVoiceClip(token!, key),
    [token]
  );
  const voice = useInterviewVoice(fetchClip, state?.voice_mode === "on");

  // Owned here rather than inside the recorder so the pre-start check and the
  // answer composer share one MediaStream — and therefore one permission
  // prompt for the whole session.
  const mic = useMicStream();

  // GET state is the source of truth: rendered on mount, refetched after any
  // stream error. SSE events only advance live state between fetches.
  const fetchState = useCallback(async () => {
    if (!token) return;
    return getInterviewState(token)
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(
            err.status === 404
              ? "This interview link is invalid or no longer exists."
              : err.message
          );
        } else {
          setError("Something went wrong. Please refresh the page.");
        }
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  useEffect(() => {
    if (token) fetchState();
  }, [token, fetchState]);

  const handleStart = async () => {
    if (!token) return;
    // Synchronously inside the click, before any await: this is the user
    // gesture that unlocks audio playback for the rest of the interview.
    // Awaiting first would spend the gesture and every question would need a
    // manual tap.
    voice.prime();
    setIsStarting(true);
    setNotice(null);
    try {
      const s = await startInterview(token);
      setState(s);
      // The greeting and the first question arrive together and are spoken in
      // order. Only turns that arrive after mount are ever queued, so a
      // refresh restores the transcript silently.
      voice.enqueue(s.turns.map((t) => t.voice_key));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not start the interview.");
    } finally {
      setIsStarting(false);
    }
  };

  // Shared by both composers. The answer bubble is rendered from the ack's
  // content, which is the text the server actually committed — for a spoken
  // answer that is the only place it exists, and for a typed one it beats
  // trusting the local draft.
  const streamHandlers = () => ({
    onAck: (answerSeq: number, content: string) => {
      const answerTurn: InterviewTurnData = {
        seq: answerSeq,
        role: "candidate" as const,
        kind: "answer" as const,
        question_index: null,
        content,
        created_at: new Date().toISOString(),
      };
      setState((prev) =>
        prev ? { ...prev, turns: [...prev.turns, answerTurn] } : prev
      );
      setDraft("");
    },
    onTurn: (turn: InterviewTurnData) => {
      setState((prev) => (prev ? { ...prev, turns: [...prev.turns, turn] } : prev));
      // Speak the reply as it lands. The text frame is rendered immediately and
      // the clip is fetched alongside it, so a cache miss delays only the audio
      // — the candidate can read and answer without waiting for it.
      voice.enqueue([turn.voice_key]);
    },
    onState: (s: InterviewStateEvent) => {
      setState((prev) => (prev ? { ...prev, ...s } : prev));
    },
    onDone: () => {
      setIsSubmitting(false);
    },
    onError: (message: string, status?: number) => {
      setIsSubmitting(false);
      setNotice(message);
      // A 429 means we were throttled before the answer was ever processed, so
      // nothing changed server-side and the draft is still intact (it is only
      // cleared on `ack`). Refetching would just add a round trip on a
      // connection we have already been asked to ease up on.
      if (status === 429) return;
      // Whatever else happened, the server is the source of truth now.
      fetchState();
    },
  });

  const nextAfterSeq = (s: InterviewState) =>
    s.turns.length > 0 ? s.turns[s.turns.length - 1].seq : 0;

  const handleSubmit = async () => {
    if (!token || !state || isSubmitting) return;
    const content = draft.trim();
    if (!content) return;

    setIsSubmitting(true);
    setNotice(null);
    // Answering means they are done listening; talking over them is rude.
    voice.stop();
    await submitAnswer(token, content, nextAfterSeq(state), streamHandlers());
  };

  // Resolves to an error message, or null once the answer is committed. The
  // recorder keeps the blob until it sees null, so Retry re-sends the same
  // recording rather than making the candidate speak again.
  const handleSubmitAudio = async (blob: Blob) => {
    if (!token || !state || isSubmitting) return "Not ready to submit yet.";

    setIsSubmitting(true);
    setNotice(null);
    voice.stop();
    return submitAudioAnswer(token, blob, nextAfterSeq(state), streamHandlers());
  };

  // Missing token or fatal error
  if (!token || error) {
    return (
      <main className="px-6 py-24 min-h-[calc(100vh-80px)] bg-muted/30">
        <div className="max-w-md mx-auto text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-card shadow-sm border border-border">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            Interview unavailable
          </h1>
          <p className="text-muted-foreground font-medium">
            {error ??
              "This page needs an invite link. Please use the exact link you were given."}
          </p>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="px-6 py-24 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-primary/10 animate-pulse" />
          <Loader2 className="absolute top-0 left-0 w-16 h-16 animate-spin text-primary border-4 border-transparent border-t-primary rounded-full" />
        </div>
        <p className="mt-6 text-foreground font-bold text-lg">Loading your interview...</p>
      </main>
    );
  }

  if (!state) return null;

  const hasCompany = state.company_name && state.company_name !== "null";
  // Null once the interview is over (completed, assessed, expired); `created`
  // and `in_progress` both carry a real value. No numeric fallback on purpose:
  // the opening no longer states a duration, so this and the countdown are the
  // only places the candidate learns it, and inventing 15 here would be a
  // guess presented as fact.
  const totalMinutes = state.time_remaining_seconds
    ? Math.round(state.time_remaining_seconds / 60)
    : null;
  const isDone = state.status === "completed" || state.status === "assessed";
  // The interview's own snapshot, never an env var or a client flag: an invite
  // minted under one mode stays that mode even after the deployment flips.
  const isAudioMode = state.answer_mode === "audio";
  const isVoiceMode = state.voice_mode === "on";

  // Intro screen
  if (state.status === "created") {
    return (
      <main className="px-6 py-20 min-h-[calc(100vh-80px)] bg-muted/30">
        <div className="max-w-xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-card shadow-sm border border-border mb-2">
              <MessageSquareText className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
              {state.job_title ?? "Screening Interview"}
            </h1>
            {hasCompany && (
              <p className="text-muted-foreground font-medium">{state.company_name}</p>
            )}
          </div>

          <Card className="p-8 shadow-xl border-border/60 rounded-3xl space-y-6">
            {notice && (
              <div className="bg-error border border-error-edge text-error-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
                <X className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="font-medium">{notice}</p>
              </div>
            )}

            <div className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <ListChecks className="w-5 h-5 text-primary shrink-0" />
                <span>
                  <span className="font-semibold text-foreground">
                    {state.total_questions} questions
                  </span>{" "}
                  about your background and experience
                </span>
              </div>
              {totalMinutes !== null && (
                <div className="flex items-center gap-3">
                  <Timer className="w-5 h-5 text-primary shrink-0" />
                  <span>
                    Around{" "}
                    <span className="font-semibold text-foreground">
                      {totalMinutes} minutes
                    </span>
                    , with the timer starting when you begin
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                {isAudioMode ? (
                  <Mic className="w-5 h-5 text-primary shrink-0" />
                ) : (
                  <Send className="w-5 h-5 text-primary shrink-0" />
                )}
                <span>
                  {isAudioMode ? "Speak each answer" : "Type each answer"}, then press{" "}
                  <span className="font-semibold text-foreground">Done answering</span>{" "}
                  to continue
                </span>
              </div>
              {isVoiceMode && (
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-primary shrink-0" />
                  <span>
                    Questions are{" "}
                    <span className="font-semibold text-foreground">read aloud</span> —
                    turn your sound on, or mute them and read instead
                  </span>
                </div>
              )}
            </div>

            {/* Recording notice: shown before any microphone prompt and before
                the timer starts, because that is the last moment a candidate
                can decline. */}
            {isAudioMode && (
              <div className="rounded-2xl border border-border bg-muted/40 p-5 space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p className="font-bold text-foreground text-sm">
                  Before you start: this interview is recorded
                </p>
                <ul className="space-y-1.5 list-disc pl-4">
                  <li>
                    You answer out loud, so your microphone will be used to record
                    each answer.
                  </li>
                  <li>
                    Recordings are transcribed to text by an AI system. The
                    transcript is what the recruiter and an AI assessment review.
                  </li>
                  <li>
                    Your recordings are kept, and the recruiter may listen to them
                    alongside the transcript.
                  </li>
                  <li>
                    The questions and the assessment are AI-generated; the recruiter
                    reviews the results.
                  </li>
                </ul>
                <p className="font-medium text-foreground pt-1">
                  By starting, you agree to be recorded and transcribed, and to have
                  your recording reviewed as described.
                </p>
              </div>
            )}

            {/* After the consent block on purpose: the check is the first thing
                that touches the microphone, so declining is still possible
                before any prompt appears. */}
            {isAudioMode && <MicCheck mic={mic} voiceMode={isVoiceMode} />}

            <Button
              onClick={handleStart}
              disabled={isStarting}
              className="w-full h-14 text-base font-bold rounded-xl shadow-lg shadow-primary/10 active:scale-[0.98] transition-all cursor-pointer"
            >
              {isStarting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </span>
              ) : (
                "Start Interview"
              )}
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  // Expired screen
  if (state.status === "expired") {
    return (
      <main className="px-6 py-20 min-h-[calc(100vh-80px)] bg-muted/30">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
              This interview invite has expired
            </h1>
            <p className="text-muted-foreground font-medium">
              Please contact the recruiter for a new link.
            </p>
          </div>
          {state.turns.length > 0 && (
            <Card className="p-6 rounded-3xl border-border/60">
              <InterviewTranscript turns={state.turns} autoScroll={false} />
            </Card>
          )}
        </div>
      </main>
    );
  }

  // Chat (in_progress) and done screens share the transcript layout
  return (
    <main className="px-6 py-10 max-w-3xl mx-auto min-h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-foreground tracking-tight truncate">
            {state.job_title ?? "Screening Interview"}
          </h1>
          {hasCompany && (
            <p className="text-xs text-muted-foreground">{state.company_name}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isVoiceMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={voice.toggleMute}
              aria-label={voice.muted ? "Unmute questions" : "Mute questions"}
              title={voice.muted ? "Questions are muted" : "Mute spoken questions"}
              className="h-9 w-9 rounded-full cursor-pointer"
            >
              {voice.muted ? (
                <VolumeX className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Volume2 className="w-4 h-4 text-primary" />
              )}
            </Button>
          )}
          {!isDone && (
            <>
              <Badge variant="outline" className="font-semibold">
                Question {Math.max(state.question_number, 1)} of {state.total_questions}
              </Badge>
              <InterviewCountdown seconds={state.time_remaining_seconds} />
            </>
          )}
          {isDone && (
            <Badge
              variant="outline"
              className="bg-success text-success-foreground border-success-edge font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Completed
            </Badge>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 py-6">
        <InterviewTranscript
          turns={state.turns}
          showTyping={isSubmitting}
          renderQuestionAudio={
            isVoiceMode
              ? (turn) => (
                  <QuestionSpeaker
                    voiceKey={turn.voice_key!}
                    status={voice.status}
                    isActive={voice.activeKey === turn.voice_key}
                    onReplay={voice.replay}
                  />
                )
              : undefined
          }
        />
      </div>

      {/* Composer or done note */}
      {isDone ? (
        <Card className="p-6 rounded-2xl border-success-edge bg-success/40 text-center space-y-1">
          <p className="font-bold text-foreground">Thanks for your time!</p>
          <p className="text-sm text-muted-foreground">
            Your interview has been submitted. The team will review it and follow up.
          </p>
        </Card>
      ) : isAudioMode ? (
        <AnswerRecorder
          mic={mic}
          onSubmit={handleSubmitAudio}
          onRecordingStart={voice.stop}
        />
      ) : (
        <div className="space-y-3 pb-2">
          {notice && (
            <div className="bg-error border border-error-edge text-error-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-medium">{notice}</p>
            </div>
          )}
          <Textarea
            placeholder="Type your answer here..."
            value={draft}
            maxLength={MAX_ANSWER_LENGTH}
            disabled={isSubmitting}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-28 max-h-64 resize-none text-sm rounded-xl"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">
              {draft.length > MAX_ANSWER_LENGTH - 500
                ? `${MAX_ANSWER_LENGTH - draft.length} characters left`
                : "Answer in your own words; a few sentences is plenty."}
            </span>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || draft.trim() === ""}
              className="h-11 px-6 font-bold rounded-xl cursor-pointer"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Done answering
                  <Send className="w-4 h-4" />
                </span>
              )}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function InterviewPage() {
  return (
    <React.Suspense>
      <InterviewPageInner />
    </React.Suspense>
  );
}
