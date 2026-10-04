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
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { InterviewCountdown } from "@/components/interview/countdown";
import { MicCheck } from "@/components/interview/mic-check";
import { QuestionSpeaker } from "@/components/interview/question-speaker";
import { AnswerRecorder } from "@/components/interview/recorder";
import { isSendShortcut, SendShortcutHint } from "@/components/interview/send-shortcut";
import { InterviewTranscript } from "@/components/interview/transcript";
import { useInterviewVoice } from "@/components/interview/use-interview-voice";
import { useMicStream } from "@/components/interview/use-mic-stream";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type {
  InterviewState,
  InterviewStateEvent,
  InterviewTurnData,
} from "@/lib/interview-types";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";
import {
  fetchVoiceClip,
  getInterviewState,
  startInterview,
  submitAnswer,
  submitAudioAnswer,
} from "@/services/interview";

const MAX_ANSWER_LENGTH = 5000;

/** Statuses for which the server withholds the transcript. */
const FINISHED_STATUSES = new Set(["completed", "assessed", "expired"]);

/** Centered single-message screen: unavailable, expired, already submitted. */
function StatusScreen({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="px-6 py-24 min-h-[calc(100vh-80px)]">
      <div className="max-w-md mx-auto text-center space-y-4">
        {icon}
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}

const neutralIconTile =
  "inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-card shadow-sm border border-border";


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
        // The server withholds turns once the interview is over. A refetch
        // in the same session (after a stream error at the very end) keeps
        // the transcript already on screen rather than blanking the chat.
        setState((prev) =>
          prev && FINISHED_STATUSES.has(s.status) ? { ...s, turns: prev.turns } : s
        );
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

  // Follow the conversation to the page end, which is also where the sticky
  // composer rests, so the newest turn is never hidden behind it. Owned here,
  // not by the transcript, because the composer is this page's. Zero turns is
  // every screen that isn't the chat.
  const turnCount = state?.turns.length ?? 0;
  useEffect(() => {
    if (turnCount === 0) return;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }, [turnCount, isSubmitting]);

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
      <StatusScreen
        title="Interview unavailable"
        icon={
          <div className={neutralIconTile}>
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
        }
      >
        <p className="text-muted-foreground font-medium">
          {error ??
            "This page needs an invite link. Please use the exact link you were given."}
        </p>
      </StatusScreen>
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
    const questionCount = state.total_questions;
    // Short facts as tiles rather than sentences, so the whole screen
    // (facts, consent, mic check, start) fits without scrolling.
    const facts = [
      {
        icon: ListChecks,
        title: `${questionCount} ${questionCount === 1 ? "question" : "questions"}`,
        detail: "About your background and experience",
      },
      ...(totalMinutes !== null
        ? [
            {
              icon: Timer,
              // The snapshotted time limit, not an estimate: a short interview
              // finishes well inside it.
              title: `Up to ${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`,
              detail: "The timer starts when you begin",
            },
          ]
        : []),
      {
        icon: isAudioMode ? Mic : Send,
        title: isAudioMode ? "Answer out loud" : "Type your answers",
        detail: "Press Done answering after each one",
      },
      ...(isVoiceMode
        ? [
            {
              icon: Volume2,
              title: "Questions read aloud",
              detail: "Turn your sound on, or mute and read",
            },
          ]
        : []),
    ];

    const startButton = (
      <Button
        onClick={handleStart}
        disabled={isStarting}
        className="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/10 active:scale-[0.98] transition-all cursor-pointer"
      >
        {isStarting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Starting…
          </span>
        ) : (
          "Start interview"
        )}
      </Button>
    );

    const factTiles = (
      <ul
        className={cn(
          "grid grid-cols-1 gap-3",
          facts.length === 3 && !isAudioMode ? "sm:grid-cols-3" : "sm:grid-cols-2"
        )}
      >
        {facts.map((f) => (
          <li key={f.title} className="flex items-start gap-3 rounded-xl bg-muted/40 px-4 py-3">
            <f.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{f.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{f.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    );

    return (
      <main className="px-4 sm:px-6 py-8 md:py-10 min-h-[calc(100vh-80px)]">
        {/* Voice interviews carry consent and a mic check, too tall for one
            column on a laptop screen, so they split into two equal halves:
            what you are agreeing to on the left, getting ready and starting on
            the right. Text interviews are short and stay one narrow column. */}
        <div className={cn("mx-auto space-y-6", isAudioMode ? "max-w-5xl" : "max-w-xl")}>
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-card shadow-sm border border-border mb-1">
              <MessageSquareText className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
              {state.job_title ?? "Screening interview"}
              {hasCompany && (
                <span className="text-muted-foreground font-semibold"> at {state.company_name}</span>
              )}
            </h1>
            <p className="text-muted-foreground">
              An AI interviewer asks the questions. The hiring team reviews your answers.
            </p>
          </div>

          {notice && <ErrorBanner>{notice}</ErrorBanner>}

          {isAudioMode ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-6 gap-5 border-border/60 rounded-3xl">
                <h2 className="font-semibold text-foreground">What to expect</h2>
                {factTiles}
                {/* Recording notice: shown before any microphone prompt and
                    before the timer starts, because that is the last moment a
                    candidate can decline. Full-size text: this is the one block
                    here the candidate has to read, not skim. */}
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-foreground">This interview is recorded</p>
                  <ul className="space-y-1 list-disc pl-5 text-muted-foreground">
                    <li>Your microphone records each answer, and an AI system transcribes it.</li>
                    <li>
                      Recordings are kept. The recruiter reviews the transcript and an AI
                      assessment, and may listen to the recordings.
                    </li>
                    <li>
                      The questions and the assessment are AI-generated; the recruiter
                      reviews the results.
                    </li>
                  </ul>
                </div>
              </Card>

              {/* Second in reading order and in the stacked mobile layout: the
                  mic check is the first thing that touches the microphone, so
                  declining is still possible before any prompt appears. */}
              <Card className="p-6 gap-5 border-border/60 rounded-3xl">
                <h2 className="font-semibold text-foreground">Before you start</h2>
                <MicCheck mic={mic} voiceMode={isVoiceMode} />
                <div className="mt-auto space-y-3 pt-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      By starting, you agree to be recorded and transcribed
                    </span>
                    , and to have your recording reviewed as described.
                  </p>
                  {startButton}
                </div>
              </Card>
            </div>
          ) : (
            <Card className="p-6 sm:p-7 gap-6 border-border/60 rounded-3xl">
              {factTiles}
              {startButton}
            </Card>
          )}
        </div>
      </main>
    );
  }

  // Expired screen
  if (state.status === "expired") {
    return (
      <StatusScreen
        title="This interview invite has expired"
        icon={
          <div className={neutralIconTile}>
            <Timer className="w-8 h-8 text-muted-foreground" />
          </div>
        }
      >
        <p className="text-muted-foreground font-medium">
          Please contact the recruiter for a new link.
        </p>
      </StatusScreen>
    );
  }

  // Revisit of a finished interview. No transcript: the link is the only
  // credential and outlives the interview, so a forwarded or leaked invite
  // should not read back the candidate's answers. `assessed` renders exactly
  // like `completed` so the candidate can't tell they have been scored.
  // No turns means none were seen this session: the server sent none, and an
  // interview that finished live keeps the ones already on screen.
  if (isDone && state.turns.length === 0) {
    return (
      <StatusScreen
        title="Your interview has been submitted"
        icon={
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-success border border-success-edge">
            <CheckCircle2 className="w-8 h-8 text-success-foreground" />
          </div>
        }
      >
        <p className="text-muted-foreground font-medium">
          Thanks for interviewing for {state.job_title ?? "this role"}
          {hasCompany && <> at {state.company_name}</>}. The hiring team will review it
          and follow up with you.
        </p>
        <p className="text-sm text-muted-foreground">
          Nothing else is needed from you. You can close this page.
        </p>
      </StatusScreen>
    );
  }

  // The question awaiting an answer, drawn stronger in the transcript. Only
  // while the interviewer has the floor: once an answer is in flight, or the
  // interview is over, nothing is being asked.
  const lastTurn = state.turns[state.turns.length - 1];
  const activeSeq =
    !isDone &&
    !isSubmitting &&
    lastTurn?.role === "interviewer" &&
    (lastTurn.kind === "question" || lastTurn.kind === "followup")
      ? lastTurn.seq
      : null;

  // One segment per main question. Follow-ups don't advance it, which is the
  // honest signal: they are still on the same question.
  const questionNumber = Math.max(state.question_number, 1);
  const segmentClasses = Array.from({ length: Math.max(state.total_questions, 1) }, (_, i) =>
    isDone
      ? "bg-success-bar"
      : i < questionNumber - 1
        ? "bg-foreground/70"
        : i === questionNumber - 1
          ? "bg-foreground/30"
          : "bg-muted"
  );

  // Chat (in_progress) and done screens share the transcript layout
  return (
    <main className="px-6 pb-2 max-w-3xl mx-auto min-h-[calc(100vh-80px)] flex flex-col">
      {/* Header: pinned, so the timer and progress stay in view however long
          the transcript gets. */}
      <div className="sticky top-0 z-30 pt-6 bg-background border-b border-border">
        <div className="flex items-center justify-between gap-4 pb-4">
          <h1 className="min-w-0 truncate text-lg font-extrabold text-foreground tracking-tight">
            {state.job_title ?? "Screening interview"}
            {hasCompany && (
              <span className="font-semibold text-muted-foreground"> · {state.company_name}</span>
            )}
          </h1>
          <div className="flex items-center gap-3 shrink-0">
            {/* Nothing autoplays once the interview is over, so there is
                nothing left to mute; replay still works per turn. */}
            {isVoiceMode && !isDone && (
              <Button
                variant="ghost"
                size="sm"
                onClick={voice.toggleMute}
                aria-label={voice.muted ? "Unmute questions" : "Mute questions"}
                aria-pressed={voice.muted}
                className="h-8 rounded-full px-2.5 text-xs font-semibold cursor-pointer"
              >
                {voice.muted ? (
                  <VolumeX className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Volume2 className="w-4 h-4 text-primary" />
                )}
                <span className={cn("hidden sm:inline", voice.muted && "text-muted-foreground")}>
                  {voice.muted ? "Muted" : "Sound on"}
                </span>
              </Button>
            )}
            {!isDone && (
              <>
                <Badge variant="outline" className="font-semibold">
                  Question {questionNumber} of {state.total_questions}
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
        <div
          className="flex gap-1 pb-3"
          role="progressbar"
          aria-label="Interview progress"
          aria-valuemin={0}
          aria-valuemax={state.total_questions}
          aria-valuenow={isDone ? state.total_questions : questionNumber - 1}
        >
          {segmentClasses.map((tone, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", tone)} />
          ))}
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 py-5">
        <InterviewTranscript
          turns={state.turns}
          showTyping={isSubmitting}
          activeSeq={activeSeq}
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
        <Card className="mb-6 p-6 gap-1 items-center rounded-2xl border-success-edge bg-success/40 text-center">
          <CheckCircle2 className="w-6 h-6 text-success-foreground mb-1" />
          <p className="font-bold text-foreground">Thanks for your time!</p>
          <p className="text-sm text-muted-foreground">
            Your interview has been submitted. The team will review it and follow up.
          </p>
        </Card>
      ) : (
        // Pinned to the bottom so the answer controls never scroll away.
        <div className="sticky bottom-0 z-20 pt-3 pb-4 bg-background">
          {isAudioMode ? (
            <AnswerRecorder
              mic={mic}
              onSubmit={handleSubmitAudio}
              onRecordingStart={voice.stop}
            />
          ) : (
            <div className="space-y-3">
              {notice && <ErrorBanner>{notice}</ErrorBanner>}
              <Textarea
                placeholder="Type your answer here..."
                value={draft}
                maxLength={MAX_ANSWER_LENGTH}
                disabled={isSubmitting}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (isSendShortcut(e)) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                className="min-h-28 max-h-64 resize-none text-sm rounded-xl"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {draft.length > MAX_ANSWER_LENGTH - 500
                    ? `${MAX_ANSWER_LENGTH - draft.length} characters left`
                    : (
                      <>
                        A few sentences is plenty.
                        <span className="hidden sm:inline">
                          {" "}<SendShortcutHint /> to send.
                        </span>
                      </>
                    )}
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
