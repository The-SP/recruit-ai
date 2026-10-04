"use client";

import {
  ArrowUpRight,
  Check,
  Copy,
  Loader2,
  Lock,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";

import { DemoNotice } from "@/components/demo-notice";
import {
  assessmentCopy,
  InterviewVerdictSummary,
} from "@/components/interview/assessment-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  interviewStatusLabels,
  interviewStatusStyles,
} from "@/lib/evaluation-styles";
import type { CachedInterview } from "@/lib/interview-types";
import { useInviteActions } from "@/lib/use-invite-actions";

/**
 * Invite management stays inline; the transcript itself lives on a dedicated
 * page (RecruiterInterviewView), laid out like the candidate's own chat. Once
 * assessed, the verdict renders here too. Service-agnostic: both results
 * pages pass wired callbacks.
 *
 * `locked` is the anonymous results page: interviews are login-only, so that
 * page passes no callbacks and gets an upsell instead of a generate button.
 * Kept as an explicit prop rather than a `useAuth()` call so this component
 * stays flow-agnostic (the compare dialog renders it with neither).
 */
export function InterviewSection({
  interview,
  interviewHref,
  onGenerate,
  onReissue,
  onAssess,
  locked = false,
}: {
  interview: CachedInterview | undefined;
  interviewHref: string | null;
  onGenerate?: () => Promise<void>;
  onReissue?: () => Promise<void>;
  onAssess?: () => Promise<void>;
  locked?: boolean;
}) {
  const { isWorking, error, demoNotice, copied, runAction, copyInviteUrl } =
    useInviteActions();

  const detail =
    interview && interview !== "loading" && interview !== "error"
      ? interview
      : null;
  const answered = detail?.turns.some((t) => t.role === "candidate") ?? false;

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MessageSquareText className="w-3.5 h-3.5" />
          AI interview
          {detail && (
            <Badge
              variant="outline"
              className={cn("ml-1", interviewStatusStyles[detail.status] ?? "")}
            >
              {interviewStatusLabels[detail.status] ?? detail.status}
            </Badge>
          )}
        </h3>

        {/* No interview yet: the whole section is this one row. The "what
            happens next" copy lives in the tooltip, since the click only opens
            a review page and nothing is sent until approval. */}
        {interview === null && onGenerate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runAction(onGenerate)}
                disabled={isWorking}
                className="gap-2 font-semibold cursor-pointer"
              >
                {isWorking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating questions...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Set up interview
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Review questions before any invite is created
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {locked && (
        <div className="space-y-2">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Navigates rather than being `disabled`: a disabled button
                  swallows the click and can't take focus, which turns the
                  upsell into a dead end. */}
              <Button
                asChild
                size="sm"
                variant="outline"
                className="gap-2 font-semibold cursor-pointer"
              >
                <Link href="/login">
                  <Lock className="w-4 h-4" />
                  Interview with an account
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Interviews are available on a free account.
            </TooltipContent>
          </Tooltip>
          <p className="text-xs text-muted-foreground">
            Sign in and run an evaluation from your dashboard to interview
            candidates with AI-generated questions.
          </p>
        </div>
      )}

      {demoNotice && <DemoNotice>{demoNotice}</DemoNotice>}

      {error && (
        <div className="bg-error border border-error-edge text-error-foreground text-xs px-3 py-2 rounded-lg flex items-start gap-2">
          <X className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {interview === "loading" && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading interview...
        </div>
      )}

      {interview === "error" && (
        <p className="text-sm text-error-foreground">Failed to load interview details.</p>
      )}

      {detail && (
        <div className="space-y-3">
          {/* Drafted but not approved: no link exists yet, so the only thing
              to offer is finishing the review. */}
          {detail.status === "draft" && interviewHref && (
            <div className="space-y-2">
              <Button asChild size="sm" variant="outline" className="gap-2 font-semibold cursor-pointer">
                <Link href={`${interviewHref}/review`}>
                  <MessageSquareText className="w-4 h-4" />
                  Review questions
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                {detail.questions_count} questions are ready for review. The
                invite link is created once you approve them.
              </p>
            </div>
          )}

          {/* Invite link while the candidate hasn't finished */}
          {detail.invite_url &&
            (detail.status === "created" || detail.status === "in_progress") && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-xs bg-card border border-border rounded-lg px-3 py-2 select-all">
                  {detail.invite_url}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyInviteUrl(detail.invite_url ?? "")}
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
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {detail.expires_at
                    ? `Expires ${new Date(detail.expires_at).toLocaleDateString()} · `
                    : ""}
                  {detail.questions_count} questions
                </span>
                {detail.status === "in_progress" && (
                  <span className="font-semibold text-foreground">
                    On question {detail.current_question_index + 1} of{" "}
                    {detail.questions_count}
                  </span>
                )}
                {detail.status === "created" && onReissue && (
                  <button
                    onClick={() => runAction(onReissue)}
                    disabled={isWorking}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline disabled:opacity-50 cursor-pointer"
                    title="Invalidate this link and issue a fresh one"
                  >
                    {isWorking ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                    Reissue link
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Completed, waiting on the assessment task. Updates on refresh —
              there is deliberately no polling here. The button covers a task
              that was never consumed (no worker running at completion), which
              from here looks identical to one still in flight. */}
          {detail.status === "completed" && !detail.assessment_error && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {assessmentCopy.pending}
              </p>
              {onAssess && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(onAssess)}
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
              )}
            </div>
          )}

          {/* Assessment task failed: surface the error and offer a retry */}
          {detail.status === "completed" && detail.assessment_error && (
            <div className="space-y-2">
              <div className="bg-error border border-error-edge text-error-foreground text-xs px-3 py-2 rounded-lg flex items-start gap-2">
                <X className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p className="font-medium">
                  {assessmentCopy.failedPrefix} {detail.assessment_error}
                </p>
              </div>
              {onAssess && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(onAssess)}
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
              )}
            </div>
          )}

          {/* The verdict at a glance; the findings are on the interview page */}
          {detail.status === "assessed" && detail.assessment && (
            <InterviewVerdictSummary assessment={detail.assessment} />
          )}

          {/* Expired mid-interview: the partial transcript can still be assessed */}
          {detail.status === "expired" && onAssess && answered && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {assessmentCopy.expiredUnfinished}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(onAssess)}
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

          {/* Expired with no answers: offer a fresh link */}
          {detail.status === "expired" && onReissue && !answered && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                The invite expired before the candidate started.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runAction(onReissue)}
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

          {/* Link out to the dedicated page: the transcript, plus the full
              findings once assessed (which is why the label changes — it is
              the only route to the detail this section deliberately omits).
              Shown once the candidate has interacted at all, on any status. */}
          {interviewHref && answered && (
            <Link
              href={interviewHref}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              {detail.status === "assessed"
                ? assessmentCopy.viewFindings
                : "View interview"}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
