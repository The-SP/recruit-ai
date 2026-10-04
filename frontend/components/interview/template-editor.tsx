"use client";

import { Info, Loader2, Minus, Plus, Settings2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { questionFocusLabels } from "@/lib/evaluation-styles";
import type {
  FixedQuestionData,
  InterviewTemplateData,
  QuestionFocus,
} from "@/lib/interview-types";
import { cn } from "@/lib/utils";

/** Mirrors MIN/MAX_QUESTIONS_PER_INTERVIEW in
 * backend/app/interview/constants.py. Both sides enforce it: the server is the
 * authority, this is what stops the recruiter finding out by rejection. */
export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 8;

const FOCUS_OPTIONS: QuestionFocus[] = [
  "experience_depth",
  "role_competency",
  "gap_probe",
];

/** Form state, distinct from InterviewTemplateData: question_count is a string
 * so the input can be emptied while typing without snapping to a number. */
export interface TemplateDraft {
  questionCount: string;
  followupsEnabled: boolean;
  timeLimitSeconds: number;
  /** The durations the server accepts. Carried on the draft rather than a
   * module constant so the picker's options come from the same response that
   * supplied the current value, and can't drift from what the API allows. */
  allowedTimeLimits: number[];
  opening: string;
  closing: string;
  fixedQuestions: FixedQuestionData[];
}

/** Seconds to whole minutes. One rounding rule, so a summary line and a picker
 * label can never disagree about what 900 seconds is. */
export function durationMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/** Seconds to a short label for the picker. */
export function formatDuration(seconds: number): string {
  return `${durationMinutes(seconds)} minutes`;
}

/** The server's allowed durations, guaranteed to contain `value` and to be
 * non-empty. Defends against a response that predates the field: `undefined`
 * would render an option-less picker, which Radix styles as a placeholder and
 * therefore greys out. */
export function withValue(
  allowed: number[] | undefined,
  value: number
): number[] {
  const options = allowed?.length ? allowed : [value];
  return options.includes(value)
    ? options
    : [...options, value].sort((a, b) => a - b);
}

/** Server values into form state. No client-side default: the endpoint always
 * returns the settings generation would use, so a fallback here could only
 * ever disagree with what the server actually does. */
export function toDraft(template: InterviewTemplateData): TemplateDraft {
  return {
    questionCount: String(template.question_count),
    followupsEnabled: template.followups_enabled,
    timeLimitSeconds: template.time_limit_seconds,
    // Union with the current value, so the trigger always has an item to match.
    // Radix marks a trigger `data-placeholder` when the value matches no item,
    // and that state renders muted -- a saved 15 with an empty or stale option
    // list would look disabled while being perfectly valid.
    allowedTimeLimits: withValue(
      template.allowed_time_limits,
      template.time_limit_seconds
    ),
    opening: template.opening ?? "",
    closing: template.closing ?? "",
    fixedQuestions: template.fixed_questions,
  };
}

/** One-line summary for the collapsed state. The whole point of collapsing is
 * that a recruiter on their fourth candidate can confirm the setup without
 * expanding anything. */
/** A fixed question needs both halves: the text is what gets asked, and the
 * subject is what the assessment grades the answer against. Whitespace doesn't
 * count, matching the server's str_strip_whitespace. */
export const isFixedQuestionIncomplete = (q: FixedQuestionData) =>
  !q.text.trim() || !q.subject.trim();

/**
 * Why this template can't be saved or generated from, or null when it can.
 *
 * Exported so the editor's own Save button and the wizard's "Generate
 * questions" button gate on one rule rather than two copies that must agree —
 * the two live in different components and would otherwise drift into
 * enabling each other's rejected states.
 */
export function templateBlockedReason(draft: TemplateDraft): string | null {
  const count = Number(draft.questionCount);
  if (!Number.isFinite(count) || count < MIN_QUESTIONS || count > MAX_QUESTIONS) {
    return `Question count must be ${MIN_QUESTIONS}–${MAX_QUESTIONS}`;
  }
  if (draft.fixedQuestions.length > count) {
    return `${draft.fixedQuestions.length} fixed questions exceed the total of ${count}`;
  }
  if (draft.fixedQuestions.some(isFixedQuestionIncomplete)) {
    return "Finish every fixed question first";
  }
  return null;
}

export function templateSummary(draft: TemplateDraft): string {
  const count = draft.questionCount || "?";
  const parts = [
    `${count} question${count === "1" ? "" : "s"}`,
    `${durationMinutes(draft.timeLimitSeconds)} min`,
    draft.followupsEnabled ? "follow-ups on" : "follow-ups off",
  ];
  if (draft.fixedQuestions.length > 0) {
    parts.push(`${draft.fixedQuestions.length} fixed`);
  }
  return parts.join(" · ");
}


/** Which surface the editor is on. One prop rather than a set of independent
 * booleans: the two surfaces differ in who owns the save action and in how
 * much framing the editor brings, and separate flags would nominally allow
 * combinations neither page wants.
 *
 * - `page`: the standalone editor. The page header already names it and its
 *   scope, so the card drops its own header and owns its Save button.
 * - `wizard-step`: step 1 of the review flow, inside a candidate's page, so
 *   the card names itself and carries the summary line. "Generate questions"
 *   saves on its way through, so a second Save would make the recruiter guess
 *   which button advances.
 */
type TemplateEditorVariant = "page" | "wizard-step";

/** Amber text that stays readable in both themes: warning-foreground is pale
 * in light mode (it's meant for text on bg-warning), so light borrows the
 * edge colour. */
const attentionText = "text-warning-edge dark:text-warning-foreground";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Card header for the wizard step only; the standalone page's own header
 * already says what this is. */
function WizardHeader({ summary }: { summary: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-border">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <Settings2 className="w-3.5 h-3.5" />
        Interview template
      </h2>
      <div className="text-sm font-semibold mt-1 truncate">{summary}</div>
    </div>
  );
}

/**
 * Placeholder shaped like the editor below, for the window where the run's
 * template is still being fetched.
 *
 * It reproduces the real chrome (card, section headings, field rows) rather
 * than showing one filled block, because a plain block at this size reads as
 * a screen of its own and the recruiter sees it flash past before the form
 * appears. The static parts (headings, labels) render for real; only the
 * values a fetch decides are bars, so the transition is a fill-in rather than
 * a swap.
 *
 * The count itself is deliberately never guessed here. A number rendered before
 * the server answers is a number the backend may disagree with, which is the
 * bug this component's `toDraft` comment describes.
 */
export function TemplateEditorSkeleton({
  variant = "wizard-step",
}: {
  variant?: TemplateEditorVariant;
}) {
  return (
    <div
      className="rounded-2xl border border-border bg-card overflow-hidden"
      aria-busy="true"
      aria-label="Loading interview template"
    >
      {variant === "wizard-step" && (
        <WizardHeader summary={<Skeleton className="h-5 w-52 rounded-md" />} />
      )}

      <div className="p-5 space-y-8">
        <Section title="Format" description={FORMAT_DESCRIPTION}>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="font-semibold">Questions per interview</Label>
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Interview length</Label>
              <Skeleton className="h-9 w-full rounded-xl" />
            </div>
          </div>
          <div className="flex items-start justify-between gap-4">
            <Label className="font-semibold">Follow-up questions</Label>
            <Skeleton className="h-[1.15rem] w-8 rounded-full" />
          </div>
        </Section>

        <div className="border-t border-border" />

        <Section title="Script" description={SCRIPT_DESCRIPTION}>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="font-semibold">Opening</Label>
              <Skeleton className="h-[4.5rem] w-full rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Closing</Label>
              <Skeleton className="h-[4.5rem] w-full rounded-lg" />
            </div>
          </div>
          <div className="space-y-3">
            <Label className="font-semibold">Fixed questions</Label>
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </Section>
      </div>
    </div>
  );
}

const FORMAT_DESCRIPTION = "How much the interview asks and how long it runs.";
const SCRIPT_DESCRIPTION =
  "Wording you want kept the same for every candidate. Anything left empty is written per resume.";

export function TemplateEditor({
  draft,
  onChange,
  interviewCount,
  disabled = false,
  isSaving = false,
  variant,
  onSave,
  isDirty = false,
  justSaved = false,
  canSaveUnchanged = false,
}: {
  draft: TemplateDraft;
  onChange: (draft: TemplateDraft) => void;
  /** How many interviews already exist for this run, so the notice can be
   * honest about what an edit does and does not reach. */
  interviewCount: number;
  disabled?: boolean;
  isSaving?: boolean;
  variant: TemplateEditorVariant;
  /** Persists the draft. Required only for `page`; `wizard-step` renders no
   * Save button, so passing one there would be dead wiring. */
  onSave?: () => Promise<boolean>;
  /** `page` only, all three: the page owns the saved snapshot, so it decides
   * what counts as changed. */
  isDirty?: boolean;
  /** The last save succeeded and nothing has changed since. */
  justSaved?: boolean;
  /** Save is allowed with no edits: a run that has never saved a template is
   * running on server defaults, and saving them pins them. */
  canSaveUnchanged?: boolean;
}) {
  const showSaveButton = variant === "page" && onSave;

  const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const setFixed = (index: number, patch: Partial<FixedQuestionData>) =>
    set(
      "fixedQuestions",
      draft.fixedQuestions.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );

  const parsedCount = Number(draft.questionCount);
  const count = Number.isFinite(parsedCount) ? parsedCount : MIN_QUESTIONS;
  const fixedCount = draft.fixedQuestions.length;

  // Adding a fixed question when they already fill the total raises the
  // total with it, rather than blocking on a stepper further up the page.
  const addFixed = () =>
    onChange({
      ...draft,
      questionCount:
        fixedCount >= count ? String(fixedCount + 1) : draft.questionCount,
      fixedQuestions: [
        ...draft.fixedQuestions,
        { text: "", focus: "role_competency", subject: "" },
      ],
    });
  // The stepper can't go below the fixed questions already written: they
  // count toward the total, so removing one is the way to shrink past them.
  const minCount = Math.max(MIN_QUESTIONS, fixedCount);
  const fixedOverflow = fixedCount > count;
  const fixedFull = fixedCount >= MAX_QUESTIONS;
  const hasIncompleteFixed = draft.fixedQuestions.some(
    isFixedQuestionIncomplete
  );
  const blockedReason = templateBlockedReason(draft);
  const generatedCount = Math.max(0, count - fixedCount);

  const canSave =
    !disabled && !isSaving && blockedReason === null && (isDirty || canSaveUnchanged);

  // One status line beside the button, in priority order: why it can't save,
  // then what state the form is in. Kept next to the button rather than
  // below the card, where a "saved" line used to outlive the next edit.
  const status: { text: string; className: string } | null = blockedReason
    ? { text: blockedReason, className: attentionText }
    : isSaving
      ? { text: "Saving…", className: "text-muted-foreground" }
      : isDirty
        ? { text: "Unsaved changes", className: attentionText }
        : justSaved
          ? {
              text: "Saved. New interviews use these settings.",
              className: "text-success-foreground",
            }
          : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {variant === "wizard-step" && (
        <WizardHeader summary={templateSummary(draft)} />
      )}

      <div className="p-5 space-y-8">
        {/* Muted surface rather than the `info` triple: that triple is
            built for badges, where a saturated fill on a few words reads
            right. Across a full-width panel it becomes a slab that outweighs
            the settings it sits above, and this is a passive statement of
            scope, not an alert. The icon carries the "informational" cue. */}
        {interviewCount > 0 && (
          <div className="bg-muted/50 border border-border text-muted-foreground text-xs px-3 py-2 rounded-lg flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {interviewCount} interview{interviewCount === 1 ? "" : "s"}{" "}
              already use this template. Changes apply to new interviews only.
            </span>
          </div>
        )}

        <Section title="Format" description={FORMAT_DESCRIPTION}>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label id="question-count-label" className="font-semibold">
                Questions per interview
              </Label>
              {/* A stepper, not a number field: the range is 1-8, and a free
                  field let a recruiter type 0 or 20 and only find out when
                  Save refused. */}
              <div
                role="group"
                aria-labelledby="question-count-label"
                className="flex items-center gap-1"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Fewer questions"
                  disabled={disabled || count <= minCount}
                  title={
                    count <= minCount && fixedCount >= count && count > MIN_QUESTIONS
                      ? "Remove a fixed question to go lower"
                      : undefined
                  }
                  className="h-9 w-9 cursor-pointer"
                  onClick={() => set("questionCount", String(count - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <output
                  aria-live="polite"
                  className="w-10 text-center text-lg font-semibold tabular-nums"
                >
                  {count}
                </output>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="More questions"
                  disabled={disabled || count >= MAX_QUESTIONS}
                  className="h-9 w-9 cursor-pointer"
                  onClick={() => set("questionCount", String(count + 1))}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {fixedCount > 0
                  ? `${fixedCount} fixed + ${generatedCount} written from each resume.`
                  : "All written from each resume."}{" "}
                Up to {MAX_QUESTIONS}.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time-limit" className="font-semibold">
                Interview length
              </Label>
              {/* Presets, not a number field: the durations are coarse, and
                  an open range invites both 3 minutes (too short to answer
                  anything) and 90 (an unbounded transcription bill). */}
              <Select
                value={String(draft.timeLimitSeconds)}
                disabled={disabled}
                onValueChange={(v) => set("timeLimitSeconds", Number(v))}
              >
                <SelectTrigger id="time-limit" className="cursor-pointer w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {draft.allowedTimeLimits.map((seconds) => (
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
                The interview closes at this point, wherever it has reached.
              </p>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="followups" className="font-semibold">
                Follow-up questions
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                When an answer is thin, the interviewer probes once before
                moving on.
              </p>
            </div>
            <Switch
              id="followups"
              checked={draft.followupsEnabled}
              disabled={disabled}
              onCheckedChange={(v) => set("followupsEnabled", v)}
              className="mt-0.5 cursor-pointer"
            />
          </div>
        </Section>

        <div className="border-t border-border" />

        <Section title="Script" description={SCRIPT_DESCRIPTION}>
          {/* Deliberately NOT prefilled from the generated draft: that text
              is written per candidate and can name them, so surfacing it as
              this run-wide field's default would put one candidate's name in
              front of everyone. Empty means the interviewer writes it. */}
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="opening" className="font-semibold">
                Opening
              </Label>
              <Textarea
                id="opening"
                rows={3}
                value={draft.opening}
                disabled={disabled}
                placeholder="Leave empty and the interviewer writes a greeting."
                onChange={(e) => set("opening", e.target.value)}
              />
              {/* Only once filled: empty, the placeholder already says it. */}
              {draft.opening.trim() && (
                <p className="text-xs text-muted-foreground">
                  Used word-for-word for every candidate.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="closing" className="font-semibold">
                Closing
              </Label>
              <Textarea
                id="closing"
                rows={3}
                value={draft.closing}
                disabled={disabled}
                placeholder="Leave empty and the interviewer writes a sign-off."
                onChange={(e) => set("closing", e.target.value)}
              />
              {draft.closing.trim() && (
                <p className="text-xs text-muted-foreground">
                  Used word-for-word for every candidate.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="font-semibold">Fixed questions</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Asked word-for-word to every candidate in this run.
                </p>
              </div>
              {/* With none yet, the dashed slot below is the add action. */}
              {fixedCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  // Blocked while one is unfinished: stacking empty cards is
                  // how a recruiter ends up with several to hunt through.
                  disabled={disabled || hasIncompleteFixed || fixedFull}
                  title={
                    hasIncompleteFixed
                      ? "Finish the question above first"
                      : fixedFull
                        ? `Interviews are capped at ${MAX_QUESTIONS} questions`
                        : "Add a question asked of every candidate"
                  }
                  className="cursor-pointer gap-2 font-semibold shrink-0"
                  onClick={addFixed}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add question
                </Button>
              )}
            </div>

            {/* Only reachable from saved data now that the stepper can't
                drop below the fixed count, but a stale server value
                shouldn't fail silently. */}
            {fixedOverflow && (
              <p className="text-sm text-destructive font-medium">
                {fixedCount} fixed questions exceed the total of {count}. Raise
                the count or remove one.
              </p>
            )}

            {fixedCount === 0 && (
              <button
                type="button"
                disabled={disabled}
                onClick={addFixed}
                className="w-full rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                No fixed questions. All {count} are written from each resume.
                <span className="mt-1 flex items-center justify-center gap-1.5 font-medium text-foreground">
                  <Plus className="w-3.5 h-3.5" />
                  Add a question for every candidate
                </span>
              </button>
            )}

            {draft.fixedQuestions.map((q, index) => (
              <div
                key={index}
                className={cn(
                  "rounded-xl border p-4 space-y-3",
                  isFixedQuestionIncomplete(q)
                    ? "border-warning-edge"
                    : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <Badge variant="outline" className="font-semibold shrink-0">
                    Fixed {index + 1}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="cursor-pointer text-muted-foreground hover:text-destructive h-7 px-2"
                    onClick={() =>
                      set(
                        "fixedQuestions",
                        draft.fixedQuestions.filter((_, i) => i !== index)
                      )
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="sr-only">Remove fixed question</span>
                  </Button>
                </div>

                <Textarea
                  rows={2}
                  required
                  aria-invalid={!q.text.trim()}
                  aria-label={`Fixed question ${index + 1}`}
                  value={q.text}
                  disabled={disabled}
                  placeholder="What should every candidate be asked?"
                  onChange={(e) => setFixed(index, { text: e.target.value })}
                />

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Question type
                    </Label>
                    <Select
                      value={q.focus}
                      disabled={disabled}
                      onValueChange={(v) =>
                        setFixed(index, { focus: v as QuestionFocus })
                      }
                    >
                      <SelectTrigger className="cursor-pointer w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOCUS_OPTIONS.map((value) => (
                          <SelectItem
                            key={value}
                            value={value}
                            className="cursor-pointer"
                          >
                            {questionFocusLabels[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`fixed-subject-${index}`}
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      What it tests
                    </Label>
                    {/* Required, not a nicety: the assessor grades each
                        answer against this (assessor.py builds its rubric
                        from subject), so a blank one has it invent a
                        standard. */}
                    <Input
                      id={`fixed-subject-${index}`}
                      required
                      aria-invalid={!q.subject.trim()}
                      value={q.subject}
                      disabled={disabled}
                      placeholder="e.g. caching strategy"
                      onChange={(e) =>
                        setFixed(index, { subject: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      The answer is graded against this.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {showSaveButton && (
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 pt-5 border-t border-border">
            {status && (
              <p
                role="status"
                className={cn("text-sm font-medium", status.className)}
              >
                {status.text}
              </p>
            )}
            <Button
              type="button"
              disabled={!canSave}
              className="cursor-pointer font-semibold gap-2"
              onClick={onSave}
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save template
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
