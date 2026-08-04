"use client";

import {
  CheckCircle2,
  KeyRound,
  ListChecks,
  Loader2,
  MessageSquareText,
  Send,
  Timer,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { InterviewCountdown } from "@/components/interview/countdown";
import { InterviewTranscript } from "@/components/interview/transcript";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { InterviewState, InterviewTurnData } from "@/lib/interview-types";
import { ApiError } from "@/services/api";
import {
  getInterviewState,
  startInterview,
  submitAnswer,
} from "@/services/interview";

const MAX_ANSWER_LENGTH = 5000;

function InterviewPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<InterviewState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState("");

  // GET state is the source of truth: rendered on mount, refetched after any
  // stream error. SSE events only advance live state between fetches.
  const fetchState = useCallback(async () => {
    if (!token) return;
    try {
      const s = await getInterviewState(token);
      setState(s);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 404
            ? "This interview link is invalid or no longer exists."
            : err.message
        );
      } else {
        setError("Something went wrong. Please refresh the page.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    fetchState();
  }, [token, fetchState]);

  const handleStart = async () => {
    if (!token) return;
    setIsStarting(true);
    setNotice(null);
    try {
      const s = await startInterview(token);
      setState(s);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not start the interview.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleSubmit = async () => {
    if (!token || !state || isSubmitting) return;
    const content = draft.trim();
    if (!content) return;

    const afterSeq = state.turns.length > 0 ? state.turns[state.turns.length - 1].seq : 0;
    setIsSubmitting(true);
    setNotice(null);

    await submitAnswer(token, content, afterSeq, {
      onAck: (answerSeq) => {
        const answerTurn: InterviewTurnData = {
          seq: answerSeq,
          role: "candidate",
          kind: "answer",
          question_index: null,
          content,
          created_at: new Date().toISOString(),
        };
        setState((prev) =>
          prev ? { ...prev, turns: [...prev.turns, answerTurn] } : prev
        );
        setDraft("");
      },
      onTurn: (turn) => {
        setState((prev) =>
          prev ? { ...prev, turns: [...prev.turns, turn] } : prev
        );
      },
      onState: (s) => {
        setState((prev) => (prev ? { ...prev, ...s } : prev));
      },
      onDone: () => {
        setIsSubmitting(false);
      },
      onError: (message) => {
        setIsSubmitting(false);
        setNotice(message);
        // Whatever happened, the server is the source of truth now.
        fetchState();
      },
    });
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
  const totalMinutes = Math.round((state.time_remaining_seconds ?? 900) / 60);
  const isDone = state.status === "completed" || state.status === "assessed";

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
              <div className="flex items-center gap-3">
                <Send className="w-5 h-5 text-primary shrink-0" />
                <span>
                  Type each answer, then press{" "}
                  <span className="font-semibold text-foreground">Done answering</span>{" "}
                  to continue
                </span>
              </div>
            </div>

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
        <InterviewTranscript turns={state.turns} showTyping={isSubmitting} />
      </div>

      {/* Composer or done note */}
      {isDone ? (
        <Card className="p-6 rounded-2xl border-success-edge bg-success/40 text-center space-y-1">
          <p className="font-bold text-foreground">Thanks for your time!</p>
          <p className="text-sm text-muted-foreground">
            Your interview has been submitted. The team will review it and follow up.
          </p>
        </Card>
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
