"use client";

import {
  ArrowLeft,
  Check,
  Eye,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DemoNotice } from "@/components/demo-notice";
import { InterviewTranscript } from "@/components/interview/transcript";
import { QuestionEditor } from "@/components/interview/question-editor";
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  TemplateEditor,
  templateBlockedReason,
  type TemplateDraft,
} from "@/components/interview/template-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { interviewModeLabels } from "@/lib/evaluation-styles";
import type {
  InterviewDetail,
  InterviewQuestionData,
  InterviewTurnData,
} from "@/lib/interview-types";
import { cn } from "@/lib/utils";

/** Placeholder answers in the preview. Real answers arrive from the candidate;
 * these exist so the recruiter reads the questions in conversation shape. */
const PLACEHOLDER_ANSWER = "The candidate answers here.";

/**
 * Build the preview transcript from the script under review.
 *
 * Follow-ups are deliberately absent. They are written live from what the
 * candidate actually says, so showing invented ones would teach recruiters to
 * expect a script the interview will not follow.
 */
function buildPreviewTurns(
  opening: string,
  questions: InterviewQuestionData[],
  closing: string
): InterviewTurnData[] {
  const turns: InterviewTurnData[] = [];
  let seq = 1;
  const at = new Date().toISOString();

  turns.push({
    seq: seq++,
    role: "interviewer",
    kind: "opening",
    question_index: null,
    content: opening,
    created_at: at,
  });

  questions.forEach((q, index) => {
    turns.push({
      seq: seq++,
      role: "interviewer",
      kind: "question",
      question_index: index,
      content: q.text,
      created_at: at,
    });
    turns.push({
      seq: seq++,
      role: "candidate",
      kind: "answer",
      question_index: index,
      content: PLACEHOLDER_ANSWER,
      created_at: at,
    });
  });

  turns.push({
    seq: seq++,
    role: "interviewer",
    kind: "closing",
    question_index: null,
    content: closing,
    created_at: at,
  });

  return turns;
}

export type ScriptDraft = {
  opening: string;
  questions: InterviewQuestionData[];
  closing: string;
};

/**
 * The review gate: a recruiter confirms the setup, then reads and edits the
 * generated questions before any candidate can reach them.
 *
 * Two steps, because generation is the expensive irreversible bit. Step 1
 * settles what to ask for; only the transition to step 2 spends an LLM call.
 * Generating first and offering the settings afterwards -- the earlier shape
 * of this page -- meant every wrong template cost a wasted call and a set of
 * questions the recruiter was told they couldn't change.
 *
 * Service-free like RecruiterInterviewView: the page owns fetching and passes
 * bound callbacks.
 */
export function InterviewReviewView({
  backHref,
  candidateName,
  jobTitle,
  interview,
  generating,
  script,
  onScriptChange,
  template,
  onTemplateChange,
  interviewCount,
  hasSavedTemplate,
  isApproving,
  error,
  demoNotice,
  onGenerate,
  onApprove,
  onAddQuestionToTemplate,
}: {
  backHref: string;
  candidateName: string | null;
  jobTitle: string | null;
  interview: InterviewDetail | null;
  generating: boolean;
  script: ScriptDraft | null;
  onScriptChange: (script: ScriptDraft) => void;
  /** Null until the server's settings arrive. The panel is withheld rather
   * than rendered with a placeholder count, so no number on screen is ever one
   * the backend wouldn't use. */
  template: TemplateDraft | null;
  onTemplateChange: (draft: TemplateDraft) => void;
  interviewCount: number;
  hasSavedTemplate: boolean;
  isApproving: boolean;
  error: string | null;
  demoNotice: string | null;
  /** Saves the template if needed, then generates. The only LLM call. */
  onGenerate: () => Promise<void>;
  onApprove: () => Promise<void>;
  /** Copies one reviewed question into the run's template, so a question the
   * recruiter keeps adding by hand becomes one every candidate gets. */
  onAddQuestionToTemplate: (question: InterviewQuestionData) => Promise<boolean>;
}) {
  const [preview, setPreview] = useState(false);
  // Which step the recruiter has navigated to. Null means "not chosen yet",
  // so the step is derived from whether a script exists -- that way an
  // already-generated draft loading in (a reload, or "Continue review" from
  // the table) lands on step 2 without an effect syncing state.
  const [navigatedStep, setNavigatedStep] = useState<1 | 2 | null>(null);
  const step: 1 | 2 = navigatedStep ?? (script ? 2 : 1);

  const displayName = candidateName ?? "Candidate";
  const questionCount = script?.questions.length ?? 0;

  const previewTurns = useMemo(
    () =>
      script
        ? buildPreviewTurns(script.opening, script.questions, script.closing)
        : [],
    [script]
  );

  const busy = isApproving || generating;

  /**
   * Why approval is blocked, or null when it isn't.
   *
   * Mirrors what update_interview_draft rejects server-side, so the button
   * can't be clickable into a 400 -- and, more to the point, can't be disabled
   * without saying why. Every branch here is a message, never a bare boolean.
   */
  const approveBlockedReason: string | null = !script
    ? "Questions are still being written"
    : questionCount < MIN_QUESTIONS
      ? "An interview needs at least one question"
      : questionCount > MAX_QUESTIONS
        ? `An interview can have at most ${MAX_QUESTIONS} questions`
        : script.questions.some((q) => !q.text.trim())
          ? "Every question needs text"
          : !script.opening.trim()
            ? "The opening cannot be empty"
            : !script.closing.trim()
              ? "The closing cannot be empty"
              : null;

  /** Why step 1 can't proceed. One shared rule with the editor's own Save
   * gate, so Generate can't enable on a template the editor would reject. */
  const generateBlockedReason: string | null = !template
    ? "Loading settings"
    : templateBlockedReason(template);

  const setQuestionText = (index: number, text: string) => {
    if (!script) return;
    onScriptChange({
      ...script,
      questions: script.questions.map((q, i) =>
        i === index ? { ...q, text } : q
      ),
    });
  };

  const deleteQuestion = (index: number) => {
    if (!script) return;
    onScriptChange({
      ...script,
      questions: script.questions.filter((_, i) => i !== index),
    });
  };

  const setQuestionField = (
    index: number,
    patch: Partial<InterviewQuestionData>
  ) => {
    if (!script) return;
    onScriptChange({
      ...script,
      questions: script.questions.map((q, i) =>
        i === index ? { ...q, ...patch } : q
      ),
    });
  };

  /** Append a blank question for the recruiter to write.
   *
   * Per-candidate: it lands on this script only, which is why an added card
   * offers to copy itself into the template. `id` is provisional -- the server
   * renumbers on save so deletions can't leave gaps. */
  const addQuestion = () => {
    if (!script) return;
    onScriptChange({
      ...script,
      questions: [
        ...script.questions,
        {
          id: script.questions.length,
          text: "",
          focus: "role_competency",
          subject: "",
        },
      ],
    });
  };

  return (
    <main className="px-6 py-10 max-w-3xl mx-auto min-h-[calc(100vh-80px)] flex flex-col">
      <div className="pb-6 border-b border-border space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to results
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight truncate">
              {displayName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {jobTitle ? `${jobTitle} · ` : ""}
              {step === 1 ? "Set up the interview" : "Review before sending"}
            </p>
          </div>
          <Badge
            variant="outline"
            className="font-semibold shrink-0 bg-warning text-warning-foreground border-warning-edge border-dashed"
          >
            Needs review
          </Badge>
        </div>

        {/* Two-segment progress, matching the new-evaluation wizard. */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="h-2 flex-1 rounded-full bg-primary" />
            <div
              className={cn(
                "h-2 flex-1 rounded-full transition-colors",
                step === 2 ? "bg-primary" : "bg-muted"
              )}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Step {step} of 2 —{" "}
            {step === 1
              ? "Confirm what to ask, then the questions get written"
              : "No one can open this interview until you approve it"}
          </p>
        </div>
      </div>

      {demoNotice && (
        <div className="pt-5">
          <DemoNotice>{demoNotice}</DemoNotice>
        </div>
      )}

      {error && (
        <div className="mt-5 bg-error border border-error-edge text-error-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
          <X className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {step === 1 && (
        <div className="flex-1 py-6 space-y-6">
          {template ? (
            <TemplateEditor
              draft={template}
              onChange={onTemplateChange}
              interviewCount={interviewCount}
              disabled={busy}
              variant="wizard-step"
            />
          ) : (
            <Skeleton className="h-64 w-full rounded-2xl" />
          )}

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {hasSavedTemplate
                ? "Saved for this run. Changes apply to every candidate."
                : "These settings are saved for the whole run."}
            </p>
            <Button
              onClick={onGenerate}
              disabled={busy || generateBlockedReason !== null}
              title={generateBlockedReason ?? undefined}
              className="cursor-pointer font-bold gap-2"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Generate questions
            </Button>
          </div>

          {generating && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Writing questions from this resume and the job description.
              </p>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-card p-5 space-y-3"
                >
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
      <div className="flex-1 py-6 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Questions for {displayName}
            </h2>
            {script && !generating && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreview((p) => !p)}
                className="cursor-pointer gap-2 font-semibold"
              >
                {preview ? (
                  <>
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Setup stays reachable, but only as a read-back: regenerating
              from here would discard every edit below and spend another call,
              so the button says what it costs. */}
          <button
            type="button"
            onClick={() => setNavigatedStep(1)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to setup (regenerating replaces these questions)
          </button>

          {script && !generating && preview && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs text-muted-foreground mb-4">
                How the interview reads to {displayName}. Follow-ups aren&apos;t
                shown — those are written live from real answers.
              </p>
              <InterviewTranscript turns={previewTurns} autoScroll={false} />
            </div>
          )}

          {script && !generating && !preview && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Opening
                </span>
                <textarea
                  rows={3}
                  value={script.opening}
                  disabled={busy}
                  onChange={(e) =>
                    onScriptChange({ ...script, opening: e.target.value })
                  }
                  className="w-full text-sm leading-relaxed bg-transparent border border-border rounded-xl px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {script.questions.map((q, index) => (
                <QuestionEditor
                  key={index}
                  question={q}
                  index={index}
                  disabled={busy}
                  canDelete={script.questions.length > MIN_QUESTIONS}
                  onChange={(text) => setQuestionText(index, text)}
                  onFieldChange={(patch) => setQuestionField(index, patch)}
                  onDelete={() => deleteQuestion(index)}
                  onAddToTemplate={() => onAddQuestionToTemplate(q)}
                />
              ))}

              <Button
                type="button"
                variant="outline"
                disabled={busy || script.questions.length >= MAX_QUESTIONS}
                title={
                  script.questions.length >= MAX_QUESTIONS
                    ? `An interview can have at most ${MAX_QUESTIONS} questions`
                    : "Write one more question for this candidate"
                }
                onClick={addQuestion}
                className="w-full cursor-pointer font-semibold gap-2 border-dashed"
              >
                <Plus className="w-4 h-4" />
                Add question
              </Button>

              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Closing
                </span>
                <textarea
                  rows={3}
                  value={script.closing}
                  disabled={busy}
                  onChange={(e) =>
                    onScriptChange({ ...script, closing: e.target.value })
                  }
                  className="w-full text-sm leading-relaxed bg-transparent border border-border rounded-xl px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {step === 2 && script && !generating && (
        <div className="sticky bottom-0 -mx-6 px-6 py-4 border-t border-border bg-background/95 backdrop-blur flex items-center justify-between gap-4">
          {/* The blocked reason replaces the summary rather than sitting next
              to it: a disabled button with no visible explanation is the thing
              that sends people to the code to find out why. */}
          {approveBlockedReason ? (
            <p className="text-xs font-medium text-destructive">
              {approveBlockedReason}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {questionCount} question{questionCount === 1 ? "" : "s"}
              </span>
              {interview && (
                <>
                  {" · "}
                  {interviewModeLabels[interview.answer_mode] ??
                    interview.answer_mode}
                  {interview.followups_enabled ? " · follow-ups on" : ""}
                </>
              )}
            </p>
          )}
          <Button
            onClick={onApprove}
            disabled={busy || approveBlockedReason !== null}
            title={approveBlockedReason ?? undefined}
            className={cn("cursor-pointer font-bold gap-2")}
          >
            {isApproving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            Approve and create link
          </Button>
        </div>
      )}
    </main>
  );
}

/** Shown after approval, in place of the editor. */
export function ApprovedNotice({
  inviteUrl,
  onCopy,
  copied,
  backHref,
}: {
  inviteUrl: string;
  onCopy: () => void;
  copied: boolean;
  backHref: string;
}) {
  return (
    <div className="rounded-2xl border border-success-edge bg-success p-5 space-y-3">
      <p className="font-bold text-success-foreground flex items-center gap-2">
        <Check className="w-4 h-4" />
        Interview approved
      </p>
      <p className="text-sm text-success-foreground/90">
        The invite link is live. Send it to the candidate.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-xs bg-background/60 rounded-lg px-3 py-2 truncate max-w-full">
          {inviteUrl}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={onCopy}
          className="cursor-pointer font-semibold gap-2"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : null}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button asChild size="sm" className="cursor-pointer font-semibold">
          <Link href={backHref}>Back to results</Link>
        </Button>
      </div>
    </div>
  );
}
