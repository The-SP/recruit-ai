"use client";

import { AlertTriangle, Minus, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  answerQualityLabels,
  answerQualityStyles,
  recommendationLabels,
  recommendationStyles,
} from "@/lib/evaluation-styles";
import type { InterviewAssessmentData } from "@/lib/interview-types";

/**
 * Copy shared by the two recruiter surfaces. The surrounding markup differs
 * (compact inline panel vs full page), but the wording must not drift.
 */
export const assessmentCopy = {
  pending: "Interview finished. Assessment pending — refresh to check.",
  assessNow: "Run assessment now",
  viewFindings: "View full assessment",
  failedPrefix: "Assessment failed:",
  retry: "Retry assessment",
  expiredUnfinished: "The invite expired before the candidate finished.",
  assessPartial: "Assess partial transcript",
} as const;

/**
 * The verdict at a glance: recommendation plus the one-line summary.
 *
 * This is what the results page shows inline. The full findings (per-question
 * quality, evidence, strengths/concerns) are deliberately not here — they run
 * to several hundred words, which reads as a page rather than a table row and
 * competes with the resume breakdown it sits beside. They live on the
 * dedicated interview page, one link away.
 */
export function InterviewVerdictSummary({
  assessment,
}: {
  assessment: InterviewAssessmentData;
}) {
  return (
    <div className="space-y-1.5">
      <Badge
        variant="outline"
        className={cn(
          "font-bold",
          recommendationStyles[assessment.recommendation] ?? ""
        )}
      >
        {recommendationLabels[assessment.recommendation] ??
          assessment.recommendation}
      </Badge>
      <p className="text-sm leading-relaxed">{assessment.overall_summary}</p>
    </div>
  );
}

/**
 * The stored interview verdict in full, for the dedicated interview page.
 * Purely presentational — data in, nothing fetched. The recommendation sits
 * beside the resume-screen's score and is never merged into it.
 */
export function InterviewAssessmentView({
  assessment,
}: {
  assessment: InterviewAssessmentData;
}) {
  return (
    <div className="space-y-4">
      {/* Verdict header */}
      <div className="space-y-2">
        <Badge
          variant="outline"
          className={cn(
            "font-bold",
            recommendationStyles[assessment.recommendation] ?? ""
          )}
        >
          {recommendationLabels[assessment.recommendation] ??
            assessment.recommendation}
        </Badge>
        <p className="text-sm leading-relaxed">{assessment.overall_summary}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {assessment.competency_summary}
        </p>
      </div>

      {/* Strengths / concerns */}
      {(assessment.strengths.length > 0 || assessment.concerns.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {assessment.strengths.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-widest text-success-foreground">
                Strengths
              </h4>
              <ul className="space-y-1">
                {assessment.strengths.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm">
                    <Plus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-success-foreground" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {assessment.concerns.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-widest text-warning-foreground">
                Concerns
              </h4>
              <ul className="space-y-1">
                {assessment.concerns.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm">
                    <Minus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning-foreground" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {assessment.gap_findings && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Gap Probes
          </h4>
          <p className="text-sm leading-relaxed">{assessment.gap_findings}</p>
        </div>
      )}

      <Separator />

      {/* Per-question findings */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Per Question
        </h4>
        {assessment.per_question.map((q) => (
          <div
            key={q.question_id}
            className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-1.5"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{q.subject}</span>
              <Badge
                variant="outline"
                className={cn("text-xs", answerQualityStyles[q.answer_quality] ?? "")}
              >
                {answerQualityLabels[q.answer_quality] ?? q.answer_quality}
              </Badge>
              {q.resume_consistency === "inconsistent" && (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 bg-error text-error-foreground border-error-edge"
                >
                  <AlertTriangle className="w-3 h-3" />
                  Contradicts resume
                </Badge>
              )}
            </div>
            {q.evidence && (
              <blockquote className="text-xs text-muted-foreground border-l-2 border-border pl-2 italic">
                &ldquo;{q.evidence}&rdquo;
              </blockquote>
            )}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {q.notes}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
