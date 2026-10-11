"use client";

import { AlertTriangle, ChevronDown, Info, Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import { InterviewTranscript } from "@/components/interview/transcript";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  competencyLabels,
  levelLabel,
  recommendationLabels,
  recommendationStyles,
} from "@/lib/evaluation-styles";
import type {
  CompetencyRatingData,
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
 * This is what the results page shows inline. The full findings (competency
 * ratings, per-question notes, strengths/concerns) are deliberately not here — they run
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

/** Anchor for a question's card, so a "Seen in" chip can scroll to it. */
const questionAnchor = (questionId: number) => `interview-q-${questionId}`;

/**
 * The stored interview verdict in full, for the dedicated interview page.
 * Purely presentational — data in, nothing fetched. The recommendation sits
 * beside the resume-screen's score and is never merged into it.
 *
 * Read top-down, scores before prose: the recommendation dial beside the two
 * competency levels (each a link to its details), then the summary with
 * strengths, concerns and any contradicted resume claim, then the reasoning
 * behind each competency, then the per-question findings. Each question card
 * carries the exchange it was judged on, so the recruiter reads question,
 * notes and the real answer together. per_question is in script order (the
 * assessor repairs it to that), which is what a turn's question_index indexes.
 */
export function InterviewAssessmentView({
  assessment,
  recommendationReasons,
  questions,
  turns,
  onFetchTurnAudio,
  renderQuestionAudio,
}: {
  assessment: InterviewAssessmentData;
  /** Why the recommendation is what it is, computed by the backend from the
   * same rule that derived it. Empty hides the explanation. */
  recommendationReasons: string[];
  questions: InterviewQuestionData[];
  turns: InterviewTurnData[];
  onFetchTurnAudio?: (seq: number) => Promise<Blob>;
  renderQuestionAudio?: (turn: InterviewTurnData) => ReactNode;
}) {
  // Which question cards have their exchange open. Lifted here so a "Seen in"
  // chip can open the card it scrolls to.
  const [openQuestions, setOpenQuestions] = useState<Set<number>>(new Set());

  const setQuestionOpen = (questionId: number, open: boolean) =>
    setOpenQuestions((prev) => {
      const next = new Set(prev);
      if (open) next.add(questionId);
      else next.delete(questionId);
      return next;
    });

  const showQuestion = (questionId: number) => {
    setQuestionOpen(questionId, true);
    scrollToAnchor(questionAnchor(questionId));
  };

  const contradictions = assessment.per_question.filter(
    (q) => q.resume_consistency === "contradicted"
  );

  return (
    <div className="space-y-8">
      {/* Scores at a glance: the outcome and the two levels behind it */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <RecommendationArc
          recommendation={assessment.recommendation}
          reasons={recommendationReasons}
        />
        <div className="space-y-1 sm:border-l sm:border-border sm:pl-6">
          {assessment.competencies.map((rating) => (
            <CompetencyBar
              key={rating.name}
              rating={rating}
              onSelect={() => scrollToAnchor(competencyAnchor(rating.name))}
            />
          ))}
        </div>
      </section>

      {/* Summary, then what stood out either way */}
      <section className="space-y-5">
        <div className="space-y-2">
          <h2 className={sectionHeading}>Summary</h2>
          <p className="text-base leading-relaxed text-foreground">
            {assessment.overall_summary}
          </p>
        </div>

        {(assessment.strengths.length > 0 || assessment.concerns.length > 0) && (
          <div className="grid gap-6 sm:grid-cols-2">
            {assessment.strengths.length > 0 && (
              <div className="space-y-1.5">
                <h3 className={sectionHeading}>Strengths</h3>
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
                <h3 className={sectionHeading}>Concerns</h3>
                <ul className="space-y-1">
                  {assessment.concerns.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm">
                      <Minus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {contradictions.length > 0 && (
          <div className="space-y-2">
            <h3 className={sectionHeading}>Resume claims not supported</h3>
            {contradictions.map((q) => (
              <div
                key={q.question_id}
                className="rounded-xl border border-error-edge bg-error/40 p-4 space-y-2 text-sm"
              >
                <button
                  type="button"
                  onClick={() => showQuestion(q.question_id)}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Q{q.question_id + 1}
                </button>
                <QuoteLine label="Resume" quote={q.resume_quote} />
                <p className="leading-relaxed">{q.notes}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* The reasoning behind each level */}
      <section className="space-y-3">
        <h2 className={sectionHeading}>Competencies</h2>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {assessment.competencies.map((rating) => (
            <CompetencyDetail
              key={rating.name}
              rating={rating}
              onShowQuestion={showQuestion}
            />
          ))}
        </div>
      </section>

      {/* Per-question findings, each with the exchange it came from */}
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
            open={openQuestions.has(q.question_id)}
            onOpenChange={(open) => setQuestionOpen(q.question_id, open)}
            onFetchTurnAudio={onFetchTurnAudio}
            renderQuestionAudio={renderQuestionAudio}
          />
        ))}
      </section>
    </div>
  );
}

function scrollToAnchor(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Anchor for a competency's details, so its bar in the scores card can
 * scroll to it. */
const competencyAnchor = (name: string) => `interview-competency-${name}`;

/** The three outcomes in the order the rule ranks them, left to right. Drawn
 * as separate segments so it reads as three outcomes, not a scale: there is
 * no score behind the recommendation, so the marker only ever sits on the
 * middle of one segment. */
const ARC_OUTCOMES = [
  {
    key: "do_not_advance",
    stroke: "stroke-error-bar",
    fill: "fill-error-bar",
    text: "text-error-foreground",
  },
  {
    key: "borderline",
    stroke: "stroke-warning-bar",
    fill: "fill-warning-bar",
    text: "text-warning-foreground",
  },
  {
    key: "advance",
    stroke: "stroke-success-bar",
    fill: "fill-success-bar",
    text: "text-success-foreground",
  },
] as const;

const ARC_CX = 100;
const ARC_CY = 104;
const ARC_RADIUS = 82;
const ARC_STROKE = 14;
// Half the gap between neighbouring segments, in degrees.
const ARC_GAP = 1.5;

function arcPoint(degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: ARC_CX + ARC_RADIUS * Math.cos(radians),
    y: ARC_CY - ARC_RADIUS * Math.sin(radians),
  };
}

function RecommendationArc({
  recommendation,
  reasons,
}: {
  recommendation: string;
  reasons: string[];
}) {
  const activeIndex = ARC_OUTCOMES.findIndex((o) => o.key === recommendation);
  const active = ARC_OUTCOMES[activeIndex];
  const label = recommendationLabels[recommendation] ?? recommendation;
  const markerAngle = activeIndex >= 0 ? 150 - activeIndex * 60 : null;
  const marker = markerAngle !== null ? arcPoint(markerAngle) : null;

  return (
    <div className="relative mx-auto w-60 shrink-0">
      <svg
        viewBox="0 0 200 128"
        className="w-full"
        role="img"
        aria-label={`Recommendation: ${label}`}
      >
        {ARC_OUTCOMES.map((outcome, i) => {
          // Flat ends between segments; the two outer tips are rounded with
          // a cap circle, since a path's linecap applies to both ends.
          const from = 180 - i * 60 - (i > 0 ? ARC_GAP : 0);
          const to = 120 - i * 60 + (i < ARC_OUTCOMES.length - 1 ? ARC_GAP : 0);
          const start = arcPoint(from);
          const end = arcPoint(to);
          const tip = i === 0 ? start : i === ARC_OUTCOMES.length - 1 ? end : null;
          const dim = i !== activeIndex && "opacity-30";
          return (
            <g key={outcome.key} className={cn(dim)}>
              <path
                d={`M ${start.x} ${start.y} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${end.x} ${end.y}`}
                fill="none"
                strokeWidth={ARC_STROKE}
                className={outcome.stroke}
              />
              {tip && (
                <circle cx={tip.x} cy={tip.y} r={ARC_STROKE / 2} className={outcome.fill} />
              )}
            </g>
          );
        })}
        {marker && markerAngle !== null && (
          <rect
            x={marker.x - 3.5}
            y={marker.y - 12}
            width={7}
            height={24}
            rx={3.5}
            strokeWidth={2.5}
            transform={`rotate(${90 - markerAngle} ${marker.x} ${marker.y})`}
            className="fill-card stroke-foreground"
          />
        )}
        {ARC_OUTCOMES.map((outcome, i) => {
          // The picked outcome is named in the centre, so its arc label would
          // only repeat it.
          if (i === activeIndex) return null;
          const position =
            i === 1
              ? { x: ARC_CX, y: 8, anchor: "middle" as const }
              : i === 0
                ? { x: ARC_CX - ARC_RADIUS - ARC_STROKE / 2, y: 124, anchor: "start" as const }
                : { x: ARC_CX + ARC_RADIUS + ARC_STROKE / 2, y: 124, anchor: "end" as const };
          return (
            <text
              key={outcome.key}
              x={position.x}
              y={position.y}
              textAnchor={position.anchor}
              fontSize={9.5}
              aria-hidden
              className="fill-muted-foreground"
            >
              {recommendationLabels[outcome.key]}
            </text>
          );
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-[19%] text-center">
        <div className="flex items-center justify-center gap-1">
          <p className="text-xs text-muted-foreground">Recommendation</p>
          {reasons.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Why this recommendation"
                  className="size-5 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Info className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-2 text-sm" align="center">
                <p className="font-semibold">Why {label.toLowerCase()}</p>
                <ul className="space-y-1.5 text-muted-foreground">
                  {reasons.map((reason) => (
                    <li key={reason} className="leading-relaxed">
                      {reason}
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <p className={cn("text-lg font-bold leading-tight", active?.text)}>{label}</p>
      </div>
    </div>
  );
}

/** A competency's level on its own row in the scores card: name, n/5 with
 * its word, and a five-step bar. The whole row links to the reasoning below.
 * The bar is neutral, not green: a rating is information, and green is
 * reserved for the page's primary action. */
function CompetencyBar({
  rating,
  onSelect,
}: {
  rating: CompetencyRatingData;
  onSelect: () => void;
}) {
  const name = competencyLabels[rating.name] ?? rating.name;
  const rated = rating.level !== null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${name}: ${
        rated ? `${rating.level} of 5, ${levelLabel(rating.level)}` : "not rated"
      }. Show details`}
      className="block w-full space-y-2 rounded-lg p-3 text-left cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">{name}</span>
        {rated ? (
          <span className="ml-auto text-sm tabular-nums">
            <span className="font-bold">{rating.level}</span>
            <span className="text-muted-foreground">/5</span>
            <span className="ml-2 text-muted-foreground">{levelLabel(rating.level)}</span>
          </span>
        ) : (
          <span className="ml-auto text-sm italic text-muted-foreground">
            {levelLabel(rating.level)}
          </span>
        )}
      </span>
      <LevelBar level={rating.level} />
    </button>
  );
}

/** A level as five steps, shared by the scores card and the details so the
 * two can't drift. Decorative: callers state the level in text. */
function LevelBar({ level, className }: { level: number | null; className?: string }) {
  return (
    <span className={cn("flex gap-1", className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn(
            "h-2 flex-1 rounded-sm",
            level !== null && n <= level ? "bg-foreground" : "bg-border"
          )}
        />
      ))}
    </span>
  );
}

/** One competency's reasoning and the answers it was based on. */
function CompetencyDetail({
  rating,
  onShowQuestion,
}: {
  rating: CompetencyRatingData;
  onShowQuestion: (questionId: number) => void;
}) {
  return (
    <div id={competencyAnchor(rating.name)} className="scroll-mt-24 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-sm font-semibold">
          {competencyLabels[rating.name] ?? rating.name}
        </h3>
        <LevelBar level={rating.level} className="w-20" />
        <span
          className={cn(
            "text-sm tabular-nums",
            rating.level === null ? "italic text-muted-foreground" : "text-muted-foreground"
          )}
        >
          {rating.level === null
            ? levelLabel(rating.level)
            : `${rating.level}/5 ${levelLabel(rating.level)}`}
        </span>
        {rating.seen_in.length > 0 && (
          <span className="flex flex-wrap items-center gap-1 sm:ml-auto">
            <span className="text-xs text-muted-foreground">Seen in</span>
            {rating.seen_in.map((questionId) => (
              <Button
                key={questionId}
                variant="outline"
                size="sm"
                onClick={() => onShowQuestion(questionId)}
                className="h-6 px-2 text-xs font-semibold cursor-pointer"
              >
                Q{questionId + 1}
              </Button>
            ))}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {rating.rationale}
      </p>
    </div>
  );
}

function QuoteLine({ label, quote }: { label: string; quote: string }) {
  return (
    <p className="leading-relaxed">
      <span className="text-xs font-semibold text-muted-foreground mr-2">{label}</span>
      <span className="italic">&ldquo;{quote}&rdquo;</span>
    </p>
  );
}

function QuestionFinding({
  index,
  finding,
  questionText,
  exchange,
  open,
  onOpenChange,
  onFetchTurnAudio,
  renderQuestionAudio,
}: {
  index: number;
  finding: QuestionAssessmentData;
  questionText: string | null;
  exchange: InterviewTurnData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFetchTurnAudio?: (seq: number) => Promise<Blob>;
  renderQuestionAudio?: (turn: InterviewTurnData) => ReactNode;
}) {
  const hasFollowup = exchange.some((t) => t.kind === "followup");
  const contradicted = finding.resume_consistency === "contradicted";

  return (
    <div
      id={questionAnchor(finding.question_id)}
      className="scroll-mt-24 rounded-xl border border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-muted-foreground tabular-nums">
          Q{index + 1}
        </span>
        <span className="text-sm font-semibold">{finding.subject}</span>
        {contradicted && (
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

      {exchange.length > 0 && (
        <Collapsible open={open} onOpenChange={onOpenChange}>
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
