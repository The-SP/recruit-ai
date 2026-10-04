"use client";

import {
  Check,
  Eye,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { DemoNotice } from "@/components/demo-notice";
import { InterviewTranscript } from "@/components/interview/transcript";
import { QuestionEditor } from "@/components/interview/question-editor";
import {
  durationMinutes,
  formatDuration,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  TemplateEditor,
  TemplateEditorSkeleton,
  templateBlockedReason,
  withValue,
  type TemplateDraft,
} from "@/components/interview/template-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { WizardSteps } from "@/components/wizard-steps";
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

/** What GENERATION_PROMPT asks questions to be answerable in ("1-3 minutes"),
 * taken at the midpoint. Only used to decide whether to warn about the clock,
 * so a rough figure is the right kind of number here. */
const MINUTES_PER_ANSWER = 2;

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
  /** Per-interview, not the template's. Seeded from the template at
   * generation, then owned by this draft so the recruiter can still change it
   * while reviewing -- it drives the engine at run time rather than the
   * generator, so it isn't already spent like the question count is. */
  followupsEnabled: boolean;
  /** Same reasoning: the engine reads it per answer, and the opening states no
   * duration, so changing it here can't contradict the frozen script. */
  timeLimitSeconds: number;
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
const REVIEW_STEPS = ["Set up the interview", "Review questions"] as const;

export function InterviewReviewView({
  candidateName,
  jobTitle,
  interview,
  generating,
  script,
  onScriptChange,
  template,
  onTemplateChange,
  interviewCount,
  headerLoading,
  hasSavedTemplate,
  isApproving,
  error,
  demoNotice,
  onGenerate,
  onApprove,
  onAddQuestionToTemplate,
  onGenerateQuestion,
}: {
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
  /** Whether the run and candidate fetches behind the header are still in
   * flight. A separate flag rather than a null check on the two fields, because
   * both are legitimately null once loaded (a run can have no job title, a run
   * item no name or filename) and a null test would skeleton those forever. */
  headerLoading: boolean;
  hasSavedTemplate: boolean;
  isApproving: boolean;
  error: string | null;
  demoNotice: string | null;
  /** Saves the template if needed, then generates the script. */
  onGenerate: () => Promise<void>;
  onApprove: () => Promise<void>;
  /** Copies one reviewed question into the run's template, so a question the
   * recruiter keeps adding by hand becomes one every candidate gets. */
  onAddQuestionToTemplate: (question: InterviewQuestionData) => Promise<boolean>;
  /** Asks the model for one more question for this candidate. Takes what is on
   * screen so it can avoid repeating it; resolves null when the call failed.
   * The second LLM call on this page, and the only one after step 1. */
  onGenerateQuestion: (
    existing: InterviewQuestionData[]
  ) => Promise<InterviewQuestionData | null>;
}) {
  const [preview, setPreview] = useState(false);
  // Derived, not state: the flow is one-way, so "has a script" is exactly what
  // separates the two steps. A draft loading in (a reload, or "Continue
  // review" from the table) therefore lands on step 2 with no effect syncing
  // anything, and there is no state that could disagree with the script.
  const step: 1 | 2 = script ? 2 : 1;

  /**
   * Ids of questions the recruiter wrote in this session.
   *
   * Provenance is tracked here rather than derived from the question itself.
   * There is no field on the wire that records who wrote a question, and the
   * previous stand-in -- an empty `subject` -- inverted as soon as the
   * recruiter filled that very field in, closing the editor mid-keystroke.
   *
   * Session-scoped by design: on reload the server's script is all there is,
   * and a saved question is just a question. Nothing downstream needs the
   * distinction, which is why it never had to be persisted.
   */
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  // Ids for questions added here, kept clear of the generator's 0..n-1 so the
  // two can never collide into one React key.
  const nextAddedId = useRef(1_000_000);
  const [generatingQuestion, setGeneratingQuestion] = useState(false);

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
  const atQuestionCap = questionCount >= MAX_QUESTIONS;

  /**
   * Whether follow-ups could push this interview past its time limit.
   *
   * Arithmetic, not a count check: follow-ups can double the turns
   * (MAX_FOLLOWUPS_PER_QUESTION is 1), the generator tells candidates to
   * answer in 1-3 minutes, and the engine closes the interview at the limit
   * wherever it has got to. So the worst case is roughly
   * questions x 2 turns x MINUTES_PER_ANSWER, and the warning is worth showing
   * only once that exceeds the clock.
   *
   * Deliberately not "the interview is full": being at the question count says
   * nothing about duration. A 1-question interview is full at 1 and can reach
   * 2 turns, which no reading of a 15-minute limit makes risky.
   */
  const worstCaseMinutes = questionCount * 2 * MINUTES_PER_ANSWER;
  // The draft's live value, not interview.time_limit_seconds: the picker below
  // edits the draft, and a warning quoting the saved number would contradict
  // the control the recruiter just moved.
  const limitMinutes = script ? durationMinutes(script.timeLimitSeconds) : null;
  /** Durations offered by the picker: the server's allowed set from the
   * template response, always including the draft's own value. `withValue` is
   * the template editor's -- one copy of the "or the trigger greys out" rule,
   * not two that have to be proven equivalent. */
  const timeLimitSeconds = script?.timeLimitSeconds;
  const allowedTimeLimits = template?.allowedTimeLimits;
  const timeLimitOptions = useMemo(
    () =>
      timeLimitSeconds === undefined
        ? []
        : withValue(allowedTimeLimits, timeLimitSeconds),
    [allowedTimeLimits, timeLimitSeconds]
  );
  const followupTimeWarning =
    script !== null &&
    script.followupsEnabled &&
    limitMinutes !== null &&
    worstCaseMinutes > limitMinutes;

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
    const id = nextAddedId.current++;
    setAddedIds((prev) => new Set(prev).add(id));
    onScriptChange({
      ...script,
      questions: [
        ...script.questions,
        {
          id,
          text: "",
          focus: "role_competency",
          subject: "",
        },
      ],
    });
  };

  /** Ask the model for one more question, grounded in this candidate's resume.
   *
   * Lands as a normal generated card, not an "added by you" one: the model
   * wrote it and filled in the rubric, so there is nothing for the recruiter
   * to complete -- only wording to review, exactly like the original set. */
  const handleGenerateQuestion = async () => {
    if (!script) return;
    setGeneratingQuestion(true);
    try {
      const question = await onGenerateQuestion(script.questions);
      if (question) {
        onScriptChange({
          ...script,
          // Re-id from the same counter as hand-added questions: the server
          // sends back a placeholder id that would collide with an existing
          // card's, and ids here only have to be unique React keys until the
          // next PATCH renumbers them.
          questions: [
            ...script.questions,
            { ...question, id: nextAddedId.current++ },
          ],
        });
      }
    } finally {
      setGeneratingQuestion(false);
    }
  };

  return (
    // Fills the viewport below the top bar (and the layout's padding) so the
    // sticky action bar sits at the bottom even when the step is short.
    <div className="max-w-3xl mx-auto min-h-[calc(100svh-5.75rem)] md:min-h-[calc(100svh-6.75rem)] flex flex-col">
      <div className="pb-6 border-b border-border space-y-4">

        <div className="flex items-start justify-between gap-4">
          {/* Name and job title arrive from two fetches separate from the
              template's. Showing the "Candidate" fallback while they are in
              flight reads as a real answer, then silently changes; a bar
              reads as pending. */}
          <div className="min-w-0">
            {headerLoading ? (
              <Skeleton className="h-8 w-56 rounded-lg" />
            ) : (
              <h1 className="text-2xl font-black tracking-tight truncate">
                {displayName}
              </h1>
            )}
            {headerLoading ? (
              <Skeleton className="h-3.5 w-32 rounded mt-2" />
            ) : (
              jobTitle && (
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {jobTitle}
                </p>
              )
            )}
          </div>
          <Badge
            variant="outline"
            className="font-semibold shrink-0 bg-warning text-warning-foreground border-warning-edge border-dashed"
          >
            Needs review
          </Badge>
        </div>

        <div className="space-y-2">
          <WizardSteps steps={REVIEW_STEPS} current={step} />
          {step === 2 && (
            <p className="text-xs text-muted-foreground">
              No one can open this interview until you approve it.
            </p>
          )}
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
            <TemplateEditorSkeleton />
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
              Questions
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

          {/* No way back to step 1, deliberately.
              Once questions exist, every step-1 field is either already spent
              or better handled here: question_count and fixed_questions were
              generation inputs (create_interview_draft returns the existing
              draft untouched, so returning and pressing Generate would have
              re-rendered the same questions under a spinner claiming to write
              new ones), and opening/closing are edited below as this
              candidate's real text. Run-wide changes belong on the standalone
              template page, where they apply to the next candidate. */}

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
                <Textarea
                  rows={3}
                  aria-label="Opening"
                  value={script.opening}
                  disabled={busy}
                  onChange={(e) =>
                    onScriptChange({ ...script, opening: e.target.value })
                  }
                  className="text-sm leading-relaxed"
                />
              </div>

              {script.questions.map((q, index) => (
                <QuestionEditor
                  // Question id, not index: deleting one would otherwise
                  // re-key every card below it, remapping their local state
                  // (the "added to template" flag) onto the wrong question.
                  key={q.id}
                  question={q}
                  index={index}
                  isAdded={addedIds.has(q.id)}
                  disabled={busy}
                  canDelete={script.questions.length > MIN_QUESTIONS}
                  onChange={(text) => setQuestionText(index, text)}
                  onFieldChange={(patch) => setQuestionField(index, patch)}
                  onDelete={() => deleteQuestion(index)}
                  onAddToTemplate={() => onAddQuestionToTemplate(q)}
                />
              ))}

              {/* Two ways to add, because they cost different things. Writing
                  one is free and immediate; asking the model spends a unit and
                  takes a few seconds. Splitting them means the recruiter
                  chooses that knowingly rather than discovering it. */}
              <div className="grid sm:grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || atQuestionCap || generatingQuestion}
                  title={
                    atQuestionCap
                      ? `An interview can have at most ${MAX_QUESTIONS} questions`
                      : "Write one more question yourself"
                  }
                  onClick={addQuestion}
                  className="cursor-pointer font-semibold gap-2 border-dashed"
                >
                  <Plus className="w-4 h-4" />
                  Write a question
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || atQuestionCap || generatingQuestion}
                  title={
                    atQuestionCap
                      ? `An interview can have at most ${MAX_QUESTIONS} questions`
                      : "Let the interviewer write one from this resume"
                  }
                  onClick={handleGenerateQuestion}
                  className="cursor-pointer font-semibold gap-2 border-dashed"
                >
                  {generatingQuestion ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {generatingQuestion ? "Writing…" : "Generate a question"}
                </Button>
              </div>

              {atQuestionCap && (
                <p className="text-xs text-muted-foreground text-center">
                  This interview is at the {MAX_QUESTIONS}-question maximum.
                  Delete one to add another.
                </p>
              )}

              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Closing
                </span>
                <Textarea
                  rows={3}
                  aria-label="Closing"
                  value={script.closing}
                  disabled={busy}
                  onChange={(e) =>
                    onScriptChange({ ...script, closing: e.target.value })
                  }
                  className="text-sm leading-relaxed"
                />
              </div>

              {/* The two settings still worth changing here. Everything else
                  step 1 governs was consumed at generation; these feed the
                  engine at run time, so they stay live until approval. The
                  length matters here in particular because step 2 can grow the
                  interview, and the warning below has to be actionable where
                  it appears. */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Delivery
                  </span>
                  {/* Said once for the card rather than on each control: both
                      are per-interview, and repeating it made the two helper
                      lines longer than the settings they explain. */}
                  <p className="text-sm text-muted-foreground">
                    This candidate only. The run&apos;s template sets the
                    defaults for everyone else.
                  </p>
                </div>

                {/* Side by side, matching the template editor: they are peer
                    settings, and stacking them implied a hierarchy neither
                    has. */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="draft-time-limit" className="font-semibold">
                      Interview length
                    </Label>
                    <Select
                      value={String(script.timeLimitSeconds)}
                      disabled={busy}
                      onValueChange={(v) =>
                        onScriptChange({ ...script, timeLimitSeconds: Number(v) })
                      }
                    >
                      <SelectTrigger
                        id="draft-time-limit"
                        className="cursor-pointer w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timeLimitOptions.map((seconds) => (
                          <SelectItem
                            key={seconds}
                            value={String(seconds)}
                            className="cursor-pointer"
                          >
                            {formatDuration(seconds)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The interview closes at this point, wherever it has
                      reached.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold">Follow-up questions</Label>
                    <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer">
                      <Checkbox
                        checked={script.followupsEnabled}
                        disabled={busy}
                        onCheckedChange={(v) =>
                          onScriptChange({
                            ...script,
                            followupsEnabled: v === true,
                          })
                        }
                        className="mt-0.5 cursor-pointer"
                      />
                      <span className="text-sm">
                        <span className="font-medium">Ask one follow-up</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          When an answer is thin, the interviewer probes once
                          before moving on.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                {followupTimeWarning && (
                  <div className="bg-warning border border-warning-edge text-warning-foreground text-xs px-3 py-2 rounded-lg flex items-start gap-2">
                    <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      With a follow-up after each of {questionCount} questions,
                      this could run about {worstCaseMinutes} minutes. The
                      interview closes at {limitMinutes} minutes, so the later
                      questions may not be reached. More time, fewer questions,
                      or follow-ups off keeps it inside the limit.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {step === 2 && script && !generating && (
        <div className="sticky bottom-0 py-4 border-t border-border bg-background/95 backdrop-blur flex items-center justify-between gap-4">
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
                  {/* The draft's live value, not the interview's saved one:
                      the toggle above is unsaved until approval, and a summary
                      contradicting the checkbox next to it is worse than none. */}
                  {script.followupsEnabled ? " · follow-ups on" : ""}
                  {limitMinutes !== null ? ` · ${limitMinutes} min` : ""}
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
    </div>
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
