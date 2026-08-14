"use client";

import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  opening: string;
  closing: string;
  fixedQuestions: FixedQuestionData[];
}

/** Server values into form state. No client-side default: the endpoint always
 * returns the settings generation would use, so a fallback here could only
 * ever disagree with what the server actually does. */
export function toDraft(template: InterviewTemplateData): TemplateDraft {
  return {
    questionCount: String(template.question_count),
    followupsEnabled: template.followups_enabled,
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
    draft.followupsEnabled ? "follow-ups on" : "follow-ups off",
  ];
  if (draft.fixedQuestions.length > 0) {
    parts.push(`${draft.fixedQuestions.length} fixed`);
  }
  return parts.join(" · ");
}

export function TemplateEditor({
  draft,
  onChange,
  interviewCount,
  disabled = false,
  isSaving = false,
  variant,
  onSave,
}: {
  draft: TemplateDraft;
  onChange: (draft: TemplateDraft) => void;
  /** How many interviews already exist for this run, so the notice can be
   * honest about what an edit does and does not reach. */
  interviewCount: number;
  disabled?: boolean;
  isSaving?: boolean;
  /** Which surface this is on. One prop rather than a set of independent
   * booleans: the two surfaces differ only in who owns the save action, and
   * separate flags would nominally allow combinations neither page wants.
   *
   * - `page`: the standalone editor. Owns its own Save button.
   * - `wizard-step`: step 1 of the review flow, where "Generate questions"
   *   saves on its way through, so a second Save would make the recruiter
   *   guess which button advances.
   */
  variant: "page" | "wizard-step";
  /** Persists the draft. Required only for `page`; `wizard-step` renders no
   * Save button, so passing one there would be dead wiring. */
  onSave?: () => Promise<boolean>;
}) {
  const showSaveButton = variant === "page";

  const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const setFixed = (index: number, patch: Partial<FixedQuestionData>) =>
    set(
      "fixedQuestions",
      draft.fixedQuestions.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );

  const count = Number(draft.questionCount);
  const fixedOverflow =
    Number.isFinite(count) && draft.fixedQuestions.length > count;
  const hasIncompleteFixed = draft.fixedQuestions.some(
    isFixedQuestionIncomplete
  );
  const blockedReason = templateBlockedReason(draft);

  return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5" />
              Interview template
            </h2>
            <p className="text-sm font-semibold mt-1 truncate">
              {templateSummary(draft)}
            </p>
          </div>
        </div>

        <div>
          <div className="px-5 pb-5 space-y-6 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">
              These settings apply to every candidate in this run. Questions
              themselves are still written per resume.
            </p>

            {interviewCount > 0 && (
              <div className="bg-info border border-info-edge text-info-foreground text-xs px-3 py-2 rounded-lg">
                {interviewCount} interview{interviewCount === 1 ? "" : "s"}{" "}
                already use this template. Changes apply to new interviews only.
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="question-count" className="font-semibold">
                  Questions per interview
                </Label>
                <Input
                  id="question-count"
                  type="number"
                  min={MIN_QUESTIONS}
                  max={MAX_QUESTIONS}
                  value={draft.questionCount}
                  disabled={disabled}
                  onChange={(e) => set("questionCount", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {MIN_QUESTIONS}–{MAX_QUESTIONS}. Fixed questions count toward
                  this total.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Follow-up questions</Label>
                <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer">
                  <Checkbox
                    checked={draft.followupsEnabled}
                    disabled={disabled}
                    onCheckedChange={(v) => set("followupsEnabled", v === true)}
                    className="mt-0.5 cursor-pointer"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Ask one follow-up</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      When an answer is thin, the interviewer probes once before
                      moving on.
                    </span>
                  </span>
                </label>
              </div>
            </div>

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
                <p className="text-xs text-muted-foreground">
                  {draft.opening.trim()
                    ? "Used word-for-word for every candidate."
                    : "Written per candidate. Type here to fix the wording."}
                </p>
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
                <p className="text-xs text-muted-foreground">
                  {draft.closing.trim()
                    ? "Used word-for-word for every candidate."
                    : "Written per candidate. Type here to fix the wording."}
                </p>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  // Blocked while one is unfinished: stacking empty cards is
                  // how a recruiter ends up with several to hunt through.
                  disabled={disabled || hasIncompleteFixed || fixedOverflow}
                  title={
                    hasIncompleteFixed
                      ? "Finish the question above first"
                      : fixedOverflow
                        ? "Raise the question count to add another"
                        : "Add a question asked of every candidate"
                  }
                  className="cursor-pointer gap-2 font-semibold shrink-0"
                  onClick={() =>
                    set("fixedQuestions", [
                      ...draft.fixedQuestions,
                      { text: "", focus: "role_competency", subject: "" },
                    ])
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>

              {fixedOverflow && (
                <p className="text-sm text-destructive font-medium">
                  {draft.fixedQuestions.length} fixed questions exceed the total
                  of {count}. Raise the count or remove one.
                </p>
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
                        <span aria-hidden className="text-destructive">
                          *
                        </span>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {showSaveButton && onSave && (
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  disabled={disabled || blockedReason !== null}
                  title={blockedReason ?? undefined}
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
      </div>
  );
}
