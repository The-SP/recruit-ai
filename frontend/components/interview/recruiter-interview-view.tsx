"use client";

import {
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import {
  assessmentCopy,
  InterviewAssessmentView,
} from "@/components/interview/assessment-view";
import { InterviewTranscript } from "@/components/interview/transcript";
import { TranscriptSheet } from "@/components/interview/transcript-sheet";
import { TurnAudioPlayer } from "@/components/interview/turn-audio-player";
import { ResumeSheet } from "@/components/evaluation/resume-sheet";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  interviewModeLabels,
  interviewStatusLabels,
  interviewStatusStyles,
} from "@/lib/evaluation-styles";
import type { ResumePanelState } from "@/lib/evaluation-types";
import type { InterviewDetail, InterviewTurnData } from "@/lib/interview-types";
import { useInviteActions } from "@/lib/use-invite-actions";

/**
 * Recruiter's view of one candidate's interview: the assessment verdict once
 * it exists, with each question's exchange folded into its finding, above the
 * full transcript (components/interview/transcript.tsx, in its neutral
 * "review" variant). Once assessed, the full transcript moves into a side
 * sheet opened from the header, beside the resume's. Navigation back is the
 * top bar's breadcrumb, not a link here.
 */
export function RecruiterInterviewView({
  candidateName,
  resumeFilename,
  resumeMarkdown,
  interview,
  onReissue,
  onAssess,
  onFetchTurnAudio,
  onFetchQuestionAudio,
}: {
  candidateName: string | null;
  resumeFilename: string | null;
  resumeMarkdown: string | null;
  interview: InterviewDetail | "loading" | "error" | null;
  onReissue: () => Promise<void>;
  onAssess: () => Promise<void>;
  /** Bound by the page; passed straight through to the transcript so this
   * component stays service-free. */
  onFetchTurnAudio?: (seq: number) => Promise<Blob>;
  onFetchQuestionAudio?: (key: string) => Promise<Blob>;
}) {
  const {
    isWorking,
    error,
    demoNotice,
    copied,
    runAction,
    copyInviteUrl,
  } = useInviteActions();
  const [resumePanel, setResumePanel] = useState<ResumePanelState | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const displayName = candidateName ?? resumeFilename ?? "Candidate";

  // Independent click-to-play per question, unlike the candidate's queued
  // autoplay. The transcript takes a render slot rather than either flow's
  // playback state, so the two models never meet in shared code.
  const renderQuestionAudio = onFetchQuestionAudio
    ? (turn: InterviewTurnData) => (
        <TurnAudioPlayer
          onFetch={() => onFetchQuestionAudio(turn.voice_key!)}
          label="Play question"
        />
      )
    : undefined;

  const handleReissue = () => runAction(onReissue);
  const handleAssess = () => runAction(onAssess);

  if (interview === "loading") {
    return <InterviewSkeleton />;
  }

  if (interview === "error") {
    return (
      <div className="max-w-3xl mx-auto">
        <Card className="p-8 text-center border-error-edge bg-error/40">
          <p className="font-semibold text-error-foreground">
            Failed to load this interview.
          </p>
        </Card>
      </div>
    );
  }

  if (interview === null) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card className="p-8 text-center">
          <p className="font-semibold text-foreground">
            No interview has been generated for this candidate yet.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Generate an invite from the candidate&apos;s breakdown first.
          </p>
        </Card>
      </div>
    );
  }

  const isDone = interview.status === "completed" || interview.status === "assessed";
  const answered = interview.turns.some((t) => t.role === "candidate");
  // Non-null only when there is a verdict to show; the transcript demotes
  // into a collapsible exactly when this is set.
  const verdict =
    interview.status === "assessed" ? interview.assessment : null;
  const meta = [
    interviewModeLabels[interview.answer_mode] ?? interview.answer_mode,
    interview.voice_mode === "on" ? "questions read aloud" : null,
    `${interview.questions_count} question${interview.questions_count === 1 ? "" : "s"}`,
    interview.completed_at
      ? `completed ${formatDate(interview.completed_at)}`
      : interview.started_at
        ? `started ${formatDate(interview.started_at)}`
        : `created ${formatDate(interview.created_at)}`,
    formatDuration(interview.started_at, interview.completed_at),
  ].filter(Boolean);

  return (
    <>
    <div className="max-w-3xl mx-auto">
      <div className="pb-6 border-b border-border space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-foreground tracking-tight break-words">
              {displayName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {meta.join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {verdict && answered && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTranscriptOpen(true)}
                className="gap-1.5 cursor-pointer"
              >
                <MessageSquareText className="w-3.5 h-3.5" />
                Transcript
              </Button>
            )}
            {resumeMarkdown && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setResumePanel({
                    name: candidateName,
                    filename: resumeFilename ?? "resume.pdf",
                    markdown: resumeMarkdown,
                  })
                }
                className="gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Resume
              </Button>
            )}
            {/* Once assessed, the verdict below says more than "Assessed" */}
            {!verdict && (
              <Badge
                variant="outline"
                className={cn("font-semibold", interviewStatusStyles[interview.status] ?? "")}
              >
                {isDone && <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                {interviewStatusLabels[interview.status] ?? interview.status}
              </Badge>
            )}
          </div>
        </div>

        {demoNotice && (
          <div className="bg-primary/5 border border-primary/20 text-foreground text-sm px-4 py-3 rounded-xl">
            {demoNotice}
          </div>
        )}
        {error && (
          <ErrorBanner>{error}</ErrorBanner>
        )}

        {/* Invite link while the candidate hasn't finished. Guarded on the
            url itself, which is null until the questions are approved. */}
        {interview.invite_url &&
          (interview.status === "created" ||
            interview.status === "in_progress") && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate text-xs bg-card border border-border rounded-lg px-3 py-2 select-all">
                {interview.invite_url}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyInviteUrl(interview.invite_url ?? "")}
                className="gap-1.5 shrink-0 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-success-foreground" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </Button>
              {interview.status === "created" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReissue}
                  disabled={isWorking}
                  className="gap-1.5 shrink-0 cursor-pointer"
                  title="Invalidate this link and issue a fresh one"
                >
                  {isWorking ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  Reissue
                </Button>
              )}
            </div>
            {interview.status === "in_progress" && (
              <p className="text-xs font-semibold text-foreground">
                On question {interview.current_question_index + 1} of{" "}
                {interview.questions_count}
              </p>
            )}
          </div>
        )}

        {/* Expired with no answers: offer a fresh link */}
        {interview.status === "expired" && !answered && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              The invite expired before the candidate started.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReissue}
              disabled={isWorking}
              className="gap-2 font-semibold cursor-pointer"
            >
              {isWorking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Reissue invite
            </Button>
          </div>
        )}

        {/* Completed, waiting on the assessment task. Updates on refresh —
            there is deliberately no polling here. The button covers a task
            that was never consumed (no worker running at completion), which
            from here looks identical to one still in flight. */}
        {interview.status === "completed" && !interview.assessment_error && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {assessmentCopy.pending}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAssess}
              disabled={isWorking}
              className="gap-2 font-semibold cursor-pointer"
            >
              {isWorking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {assessmentCopy.assessNow}
            </Button>
          </div>
        )}

        {/* Assessment task failed: surface the error and offer a retry */}
        {interview.status === "completed" && interview.assessment_error && (
          <div className="space-y-2">
            <ErrorBanner>{assessmentCopy.failedPrefix} {interview.assessment_error}</ErrorBanner>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAssess}
              disabled={isWorking}
              className="gap-2 font-semibold cursor-pointer"
            >
              {isWorking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              {assessmentCopy.retry}
            </Button>
          </div>
        )}

        {/* Expired mid-interview: the partial transcript can still be assessed */}
        {interview.status === "expired" && answered && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {assessmentCopy.expiredUnfinished}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAssess}
              disabled={isWorking}
              className="gap-2 font-semibold cursor-pointer"
            >
              {isWorking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {assessmentCopy.assessPartial}
            </Button>
          </div>
        )}
      </div>

      {/* The verdict, once the assessment task has stored one */}
      {verdict && (
        <div className="py-6">
          <InterviewAssessmentView
            assessment={verdict}
            questions={interview.questions}
            turns={interview.turns}
            onFetchTurnAudio={onFetchTurnAudio}
            renderQuestionAudio={renderQuestionAudio}
          />
        </div>
      )}

      {/* Before assessment the transcript is the page's content, so it
          stays inline; after, it lives in the header's Transcript sheet. */}
      {!answered ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          The candidate hasn&apos;t answered any questions yet.
        </p>
      ) : (
        !verdict && (
          <div className="py-6">
            <InterviewTranscript
              turns={interview.turns}
              variant="review"
              onFetchTurnAudio={onFetchTurnAudio}
              renderQuestionAudio={renderQuestionAudio}
            />
          </div>
        )
      )}
    </div>
    <ResumeSheet panel={resumePanel} onClose={() => setResumePanel(null)} />
    <TranscriptSheet
      open={transcriptOpen}
      onClose={() => setTranscriptOpen(false)}
      candidateName={displayName}
      turns={interview.turns}
      onFetchTurnAudio={onFetchTurnAudio}
      renderQuestionAudio={renderQuestionAudio}
    />
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "took 12 min", or null when the interview hasn't both started and ended. */
function formatDuration(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const minutes = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
  return minutes < 1 ? "took under a minute" : `took ${minutes} min`;
}

/** Mirrors the assessed layout (header, verdict block, findings) so the page
 * doesn't jump when the interview arrives. */
function InterviewSkeleton() {
  return (
    <div className="max-w-3xl mx-auto" aria-busy="true" aria-label="Loading interview">
      <div className="pb-6 border-b border-border space-y-2">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded" />
      </div>
      <div className="py-6 space-y-8">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-4 w-full rounded" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
