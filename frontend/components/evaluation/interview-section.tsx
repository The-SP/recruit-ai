"use client";

import {
  ArrowUpRight,
  Check,
  Copy,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";

import { DemoNotice } from "@/components/demo-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  interviewStatusLabels,
  interviewStatusStyles,
} from "@/lib/evaluation-styles";
import type { CachedInterview } from "@/lib/interview-types";
import { useInviteActions } from "@/lib/use-invite-actions";

/**
 * Pre-assessment interview states only (M5): invite management stays inline;
 * the transcript itself lives on a dedicated page (RecruiterInterviewView),
 * styled like the candidate's own chat. No rubric, no verdict — assessment
 * UI is a later milestone. Service-agnostic: both results pages pass wired
 * callbacks.
 */
export function InterviewSection({
  interview,
  interviewHref,
  onGenerate,
  onReissue,
}: {
  interview: CachedInterview | undefined;
  interviewHref: string | null;
  onGenerate: () => Promise<void>;
  onReissue: () => Promise<void>;
}) {
  const { isWorking, error, demoNotice, copied, runAction, copyInviteUrl } =
    useInviteActions();

  const detail =
    interview && interview !== "loading" && interview !== "error"
      ? interview
      : null;

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <MessageSquareText className="w-3.5 h-3.5" />
        AI Interview
        {detail && (
          <Badge
            variant="outline"
            className={cn("ml-1 normal-case", interviewStatusStyles[detail.status] ?? "")}
          >
            {interviewStatusLabels[detail.status] ?? detail.status}
          </Badge>
        )}
      </h3>

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

      {interview === null && (
        <div className="space-y-2">
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
                Generate interview invite
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Creates a private link with questions tailored to this candidate and the
            job description. Generation takes a few seconds.
          </p>
        </div>
      )}

      {detail && (
        <div className="space-y-3">
          {/* Invite link while the candidate hasn't finished */}
          {(detail.status === "created" || detail.status === "in_progress") && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-xs bg-card border border-border rounded-lg px-3 py-2 select-all">
                  {detail.invite_url}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyInviteUrl(detail.invite_url)}
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
                  Expires {new Date(detail.expires_at).toLocaleDateString()} ·{" "}
                  {detail.questions_count} questions
                </span>
                {detail.status === "in_progress" && (
                  <span className="font-semibold text-foreground">
                    On question {detail.current_question_index + 1} of{" "}
                    {detail.questions_count}
                  </span>
                )}
                {detail.status === "created" && (
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

          {/* Expired with no answers: offer a fresh link */}
          {detail.status === "expired" && !detail.turns.some((t) => t.role === "candidate") && (
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

          {/* Link out to the dedicated transcript page, styled like the
              candidate's own chat. Shown once the candidate has interacted
              at all, on any status (in_progress, completed, expired). */}
          {interviewHref && detail.turns.some((t) => t.role === "candidate") && (
            <Link
              href={interviewHref}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              View interview
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
