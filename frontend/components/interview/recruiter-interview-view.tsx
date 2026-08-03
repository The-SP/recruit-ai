"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { InterviewTranscript } from "@/components/interview/transcript";
import { ResumeSheet } from "@/components/evaluation/resume-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  interviewStatusLabels,
  interviewStatusStyles,
} from "@/lib/evaluation-styles";
import type { ResumePanelState } from "@/lib/evaluation-types";
import type { InterviewDetail } from "@/lib/interview-types";
import { useInviteActions } from "@/lib/use-invite-actions";

/**
 * Recruiter's read-only view of one candidate's interview, styled the same
 * as the candidate's own chat page (components/interview/transcript.tsx) so
 * the transcript reads exactly as it did live. No rubric, no verdict here —
 * assessment UI is a later milestone.
 */
export function RecruiterInterviewView({
  backHref,
  candidateName,
  resumeFilename,
  resumeMarkdown,
  interview,
  onReissue,
}: {
  backHref: string;
  candidateName: string | null;
  resumeFilename: string | null;
  resumeMarkdown: string | null;
  interview: InterviewDetail | "loading" | "error" | null;
  onReissue: () => Promise<void>;
}) {
  const {
    isWorking: isReissuing,
    error,
    demoNotice,
    copied,
    runAction,
    copyInviteUrl,
  } = useInviteActions();
  const [resumePanel, setResumePanel] = useState<ResumePanelState | null>(null);

  const displayName = candidateName ?? resumeFilename ?? "Candidate";

  const handleReissue = () => runAction(onReissue);

  const backLink = (
    <Link
      href={backHref}
      className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back to results
    </Link>
  );

  if (interview === "loading") {
    return (
      <main className="px-6 py-24 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground font-medium">Loading interview...</p>
      </main>
    );
  }

  if (interview === "error") {
    return (
      <main className="px-6 py-12 max-w-3xl mx-auto space-y-6">
        {backLink}
        <Card className="p-8 text-center border-error-edge bg-error/40">
          <p className="font-semibold text-error-foreground">
            Failed to load this interview.
          </p>
        </Card>
      </main>
    );
  }

  if (interview === null) {
    return (
      <main className="px-6 py-12 max-w-3xl mx-auto space-y-6">
        {backLink}
        <Card className="p-8 text-center">
          <p className="font-semibold text-foreground">
            No interview has been generated for this candidate yet.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Generate an invite from the candidate&apos;s breakdown first.
          </p>
        </Card>
      </main>
    );
  }

  const isDone = interview.status === "completed" || interview.status === "assessed";
  const answered = interview.turns.some((t) => t.role === "candidate");

  return (
    <>
    <main className="px-6 py-10 max-w-3xl mx-auto min-h-[calc(100vh-80px)] flex flex-col">
      <div className="pb-6 border-b border-border space-y-4">
        {backLink}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-foreground tracking-tight truncate">
              {displayName} — Interview
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {interview.questions_count} questions · created{" "}
              {new Date(interview.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
            <Badge
              variant="outline"
              className={cn("font-semibold", interviewStatusStyles[interview.status] ?? "")}
            >
              {isDone && <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              {interviewStatusLabels[interview.status] ?? interview.status}
            </Badge>
          </div>
        </div>

        {demoNotice && (
          <div className="bg-primary/5 border border-primary/20 text-foreground text-sm px-4 py-3 rounded-xl">
            {demoNotice}
          </div>
        )}
        {error && (
          <div className="bg-error border border-error-edge text-error-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
            <X className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* Invite link while the candidate hasn't finished */}
        {(interview.status === "created" || interview.status === "in_progress") && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate text-xs bg-card border border-border rounded-lg px-3 py-2 select-all">
                {interview.invite_url}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyInviteUrl(interview.invite_url)}
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
                  disabled={isReissuing}
                  className="gap-1.5 shrink-0 cursor-pointer"
                  title="Invalidate this link and issue a fresh one"
                >
                  {isReissuing ? (
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
              disabled={isReissuing}
              className="gap-2 font-semibold cursor-pointer"
            >
              {isReissuing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Reissue invite
            </Button>
          </div>
        )}
      </div>

      {/* Transcript, styled exactly like the candidate's live chat */}
      <div className="flex-1 py-6">
        {answered ? (
          <InterviewTranscript turns={interview.turns} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-12">
            The candidate hasn&apos;t answered any questions yet.
          </p>
        )}
      </div>
    </main>
    <ResumeSheet panel={resumePanel} onClose={() => setResumePanel(null)} />
    </>
  );
}
