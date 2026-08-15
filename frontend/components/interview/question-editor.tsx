"use client";

import { BookmarkPlus, Check, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { questionFocusLabels } from "@/lib/evaluation-styles";
import type {
  InterviewQuestionData,
  QuestionFocus,
} from "@/lib/interview-types";
import { cn } from "@/lib/utils";

const FOCUS_OPTIONS: QuestionFocus[] = [
  "experience_depth",
  "role_competency",
  "gap_probe",
];

/**
 * One question in the review list.
 *
 * A generated question shows focus and subject read-only: the review step is
 * for fixing how a question reads, and letting the wording drift from the
 * subject the assessor grades it against would quietly break the assessment
 * rather than improve the question.
 *
 * A question the recruiter added exposes both fields — the assessor needs them
 * for every question regardless of who wrote it.
 */
export function QuestionEditor({
  question,
  index,
  isAdded,
  onChange,
  onFieldChange,
  onDelete,
  onAddToTemplate,
  canDelete,
  disabled = false,
}: {
  question: InterviewQuestionData;
  index: number;
  /**
   * Whether the recruiter wrote this question here, as opposed to the model
   * generating it.
   *
   * Passed in rather than inferred from an empty `subject`. Inferring it meant
   * the card flipped to read-only on the first character typed into "What it
   * tests" — the field that makes subject non-empty is inside the branch that
   * an empty subject was keeping open, so filling it in destroyed the inputs
   * mid-keystroke and locked the question.
   */
  isAdded: boolean;
  onChange: (text: string) => void;
  onFieldChange: (patch: Partial<InterviewQuestionData>) => void;
  onDelete: () => void;
  /** Copies this question into the run's template. Resolves true on success. */
  onAddToTemplate: () => Promise<boolean>;
  canDelete: boolean;
  disabled?: boolean;
}) {
  const [savedToTemplate, setSavedToTemplate] = useState(false);
  const [savingToTemplate, setSavingToTemplate] = useState(false);

  const incomplete = !question.text.trim() || !question.subject.trim();

  const handleAddToTemplate = async () => {
    setSavingToTemplate(true);
    try {
      if (await onAddToTemplate()) setSavedToTemplate(true);
    } finally {
      setSavingToTemplate(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 space-y-3",
        incomplete ? "border-warning-edge" : "border-border"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground shrink-0">
            Question {index + 1}
          </span>
          {!isAdded && (
            <Badge variant="outline" className="font-semibold shrink-0">
              {questionFocusLabels[question.focus] ?? question.focus}
            </Badge>
          )}
          {isAdded && (
            <Badge
              variant="outline"
              className="font-semibold shrink-0 bg-info text-info-foreground border-info-edge"
            >
              Added by you
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || !canDelete}
          title={
            canDelete
              ? "Remove this question"
              : "An interview needs at least one question"
          }
          className="cursor-pointer text-muted-foreground hover:text-destructive h-7 px-2 shrink-0"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="sr-only">Remove question {index + 1}</span>
        </Button>
      </div>

      <Textarea
        rows={3}
        required
        aria-invalid={!question.text.trim()}
        aria-label={`Question ${index + 1}`}
        value={question.text}
        disabled={disabled}
        placeholder="What should this candidate be asked?"
        onChange={(e) => onChange(e.target.value)}
        className="text-sm leading-relaxed"
      />

      {isAdded ? (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">
                Question type
              </Label>
              <Select
                value={question.focus}
                disabled={disabled}
                onValueChange={(v) =>
                  onFieldChange({ focus: v as QuestionFocus })
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
                htmlFor={`question-subject-${index}`}
                className="text-xs font-semibold text-muted-foreground"
              >
                What it tests
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </Label>
              {/* Required for the same reason it is on a fixed question: the
                  assessor builds this question's rubric from it. */}
              <Input
                id={`question-subject-${index}`}
                required
                aria-invalid={!question.subject.trim()}
                value={question.subject}
                disabled={disabled}
                placeholder="e.g. caching strategy"
                onChange={(e) => onFieldChange({ subject: e.target.value })}
              />
            </div>
          </div>

          {/* An added question reaches this candidate only. Offering the
              template here is what stops a recruiter retyping the same
              question for everyone and concluding templates don't work. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || savingToTemplate || savedToTemplate || incomplete}
            title={
              incomplete
                ? "Finish the question first"
                : "Ask this of every candidate in this run"
            }
            onClick={handleAddToTemplate}
            className="cursor-pointer gap-2 font-semibold text-muted-foreground hover:text-primary h-8 px-2"
          >
            {savingToTemplate ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : savedToTemplate ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <BookmarkPlus className="w-3.5 h-3.5" />
            )}
            {savedToTemplate
              ? "Added to template"
              : "Also ask every candidate in this run"}
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold">Tests:</span> {question.subject}
        </p>
      )}
    </div>
  );
}
