"use client";

import { AlertTriangle, ChevronDown, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { InterviewTranscript } from "@/components/interview/transcript";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  answerQualityLabels,
  answerQualityStyles,
  recommendationLabels,
  recommendationStyles,
} from "@/lib/evaluation-styles";
import type {
  InterviewAssessmentData,
  InterviewQuestionData,
  InterviewTurnData,
  QuestionAssessmentData,
} from "@/lib/interview-types";

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

const sectionHeading =
  "text-xs font-bold uppercase tracking-widest text-muted-foreground";

/** Tally order: best to worst, so the line reads like a scale. */
const qualityOrder = ["strong", "adequate", "weak", "not_answered"] as const;

/**
 * The stored interview verdict in full, for the dedicated interview page.
 * Purely presentational — data in, nothing fetched. The recommendation sits
 * beside the resume-screen's score and is never merged into it.
 *
 * Each per-question finding carries the exchange it was judged on, so the
 * recruiter reads question, answer and verdict together instead of matching a
 * quote against a separate transcript. per_question is in script order (the
 * assessor repairs it to that), which is what a turn's question_index indexes.
 */
export function InterviewAssessmentView({
  assessment,
  questions,
  turns,
  onFetchTurnAudio,
  renderQuestionAudio,
}: {
  assessment: InterviewAssessmentData;
  questions: InterviewQuestionData[];
  turns: InterviewTurnData[];
  onFetchTurnAudio?: (seq: number) => Promise<Blob>;
  renderQuestionAudio?: (turn: InterviewTurnData) => ReactNode;
}) {
  const counts = new Map<string, number>();
  for (const q of assessment.per_question) {
    counts.set(q.answer_quality, (counts.get(q.answer_quality) ?? 0) + 1);
  }
  const contradictions = assessment.per_question.filter(
    (q) => q.resume_consistency === "inconsistent"
  ).length;
  const tally = qualityOrder
    .filter((quality) => counts.get(quality))
    .map((quality) => `${counts.get(quality)} ${answerQualityLabels[quality].toLowerCase()}`);

  return (
    <div className="space-y-8">
      {/* Verdict: the answer to "do I advance them", read first */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge
            variant="outline"
            className={cn(
              "text-base font-bold px-3 py-1",
              recommendationStyles[assessment.recommendation] ?? ""
            )}
          >
            {recommendationLabels[assessment.recommendation] ??
              assessment.recommendation}
          </Badge>
          <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-1.5">
            <span>{tally.join(" · ")}</span>
            {contradictions > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-error-foreground">
                · <AlertTriangle className="w-3.5 h-3.5" />
                {contradictions} contradict{contradictions === 1 ? "s" : ""} resume
              </span>
            )}
          </p>
        </div>
        <p className="text-base leading-relaxed text-foreground">
          {assessment.overall_summary}
        </p>
      </section>

      <section className="space-y-1.5">
        <h2 className={sectionHeading}>Competency</h2>
        <p className="text-sm leading-relaxed">{assessment.competency_summary}</p>
      </section>

      {/* Strengths / concerns */}
      {(assessment.strengths.length > 0 || assessment.concerns.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {assessment.strengths.length > 0 && (
            <section className="space-y-1.5">
              <h2 className={sectionHeading}>Strengths</h2>
              <ul className="space-y-1">
                {assessment.strengths.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm">
                    <Plus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-success-foreground" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {assessment.concerns.length > 0 && (
            <section className="space-y-1.5">
              <h2 className={sectionHeading}>Concerns</h2>
              <ul className="space-y-1">
                {assessment.concerns.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm">
                    <Minus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {assessment.gap_findings && (
        <section className="space-y-1.5">
          <h2 className={sectionHeading}>Gap probes</h2>
          <p className="text-sm leading-relaxed">{assessment.gap_findings}</p>
        </section>
      )}

      {/* Per-question findings, each with the exchange it was judged on */}
      <section className="space-y-3">
        <h2 className={sectionHeading}>Per question</h2>
        {assessment.per_question.map((q, i) => (
          <QuestionFinding
            key={q.question_id}
            index={i}
            finding={q}
            questionText={
              questions.find((question) => question.id === q.question_id)?.text ??
              questions[i]?.text ??
              null
            }
            // The question turn itself is shown as the card's prompt; the
            // exchange is what came after it.
            exchange={turns.filter(
              (t) => t.question_index === i && t.kind !== "question"
            )}
            onFetchTurnAudio={onFetchTurnAudio}
            renderQuestionAudio={renderQuestionAudio}
          />
        ))}
      </section>
    </div>
  );
}

function QuestionFinding({
  index,
  finding,
  questionText,
  exchange,
  onFetchTurnAudio,
  renderQuestionAudio,
}: {
  index: number;
  finding: QuestionAssessmentData;
  questionText: string | null;
  exchange: InterviewTurnData[];
  onFetchTurnAudio?: (seq: number) => Promise<Blob>;
  renderQuestionAudio?: (turn: InterviewTurnData) => ReactNode;
}) {
  const hasFollowup = exchange.some((t) => t.kind === "followup");

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-muted-foreground tabular-nums">
          Q{index + 1}
        </span>
        <span className="text-sm font-semibold">{finding.subject}</span>
        <Badge
          variant="outline"
          className={cn("text-xs", answerQualityStyles[finding.answer_quality] ?? "")}
        >
          {answerQualityLabels[finding.answer_quality] ?? finding.answer_quality}
        </Badge>
        {finding.resume_consistency === "inconsistent" && (
          <Badge
            variant="outline"
            className="text-xs gap-1 bg-error text-error-foreground border-error-edge"
          >
            <AlertTriangle className="w-3 h-3" />
            Contradicts resume
          </Badge>
        )}
      </div>

      {questionText && (
        <p className="text-sm text-muted-foreground leading-relaxed">{questionText}</p>
      )}

      <p className="text-sm leading-relaxed">{finding.notes}</p>

      {finding.evidence && (
        <blockquote className="text-xs text-muted-foreground border-l-2 border-border pl-3 italic leading-relaxed">
          &ldquo;{finding.evidence}&rdquo;
        </blockquote>
      )}

      {exchange.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="group -ml-2 gap-1.5 text-muted-foreground aria-expanded:text-foreground aria-expanded:bg-muted cursor-pointer"
            >
              {hasFollowup ? "Show answer and follow-ups" : "Show answer"}
              <ChevronDown className="w-3.5 h-3.5 transition-transform group-aria-expanded:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <InterviewTranscript
              turns={exchange}
              variant="review"
              onFetchTurnAudio={onFetchTurnAudio}
              renderQuestionAudio={renderQuestionAudio}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
