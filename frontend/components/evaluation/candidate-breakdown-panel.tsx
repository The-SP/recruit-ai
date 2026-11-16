"use client";

import { BookOpen, Briefcase, ChevronDown, Loader2, X, Zap } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { InterviewSection } from "@/components/evaluation/interview-section";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  MATCH_TYPES,
  SKILL_TIERS,
  criticalGapLabel,
  matchTypeIcons,
  matchTypeLabels,
  matchTypeStyles,
  matchedByText,
  relevanceStyles,
  scoreBarColor,
  tierSectionStyles,
} from "@/lib/evaluation-styles";
import type { BreakdownSection } from "@/lib/evaluation-types";
import type { CachedInterview } from "@/lib/interview-types";
import type { CandidateBreakdown, SkillGroupDetail } from "@/services/batch";

const STRENGTHS_PREVIEW = 6;

/** The section with the lowest score, so the panel opens on whatever pulled
 * the candidate down. Ties keep the card order. */
function weakestSection(breakdown: CandidateBreakdown): BreakdownSection | null {
  const candidates: [BreakdownSection, number | null, unknown][] = [
    ["skills", breakdown.skill_score, breakdown.skills],
    ["experience", breakdown.experience_score, breakdown.experience],
    ["education", breakdown.education_score, breakdown.education],
  ];
  let weakest: [BreakdownSection, number] | null = null;
  for (const [key, score, detail] of candidates) {
    if (score == null || !detail) continue;
    if (!weakest || score < weakest[1]) weakest = [key, score];
  }
  return weakest?.[0] ?? null;
}

function formatDuration(months: number): string | null {
  if (months <= 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? "yr" : "yrs"}`);
  if (rest) parts.push(`${rest} mo`);
  return parts.join(" ");
}

/** "2022-03" -> "Mar 2022"; anything unparseable is shown as-is. */
function formatMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Text clamped to two lines, with a toggle only when it actually overflows. */
function ClampedText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <div className="space-y-0.5">
      <p ref={ref} className={cn("break-words", !expanded && "line-clamp-2", className)}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/** The clicked chip's evidence, shown once per tier under its chip rows. */
function SkillDetail({ ev, onClose }: { ev: SkillGroupDetail; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const matchedBy = matchedByText(ev);

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 space-y-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-sm text-foreground break-words">
            {ev.skill_options.join(" / ")}
          </span>
          <Badge variant="outline" className={matchTypeStyles[ev.match_type]}>
            {matchTypeLabels[ev.match_type] || ev.match_type}
          </Badge>
          {matchedBy && (
            <span className="text-xs text-muted-foreground break-words">
              via <span className="font-medium text-foreground">{matchedBy}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close skill details"
          className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
      {ev.evidence && <p className="text-xs text-muted-foreground break-words">{ev.evidence}</p>}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="-ml-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted aria-expanded:text-foreground aria-expanded:bg-muted cursor-pointer"
          >
            Reasoning
            <ChevronDown
              className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="mt-1 text-xs text-foreground/80 break-words">{ev.reasoning}</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// The row label carries the match colour; chips stay neutral so a tier
// doesn't turn into a wall of tinted pills. A dashed chip reads as absent.
const chipClasses: Record<(typeof MATCH_TYPES)[number], string> = {
  exact: "border-border text-foreground",
  partial: "border-border text-foreground",
  none: "border-dashed border-border text-foreground",
};

/** One tier: a labelled chip row per match type, and the selected chip's
 * detail below them. */
function SkillTier({ tier, evaluations }: { tier: string; evaluations: SkillGroupDetail[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  // No tier-level count: the row labels already carry one per match type,
  // and a "matched" total counted partials as matches.
  return (
    <section>
      <div className="px-4 pt-3 pb-3 space-y-2.5">
        <h4 className={cn("text-sm font-semibold", tierSectionStyles[tier].headerClass)}>
          {tierSectionStyles[tier].label}
        </h4>
        {/* Exact first: critical gaps are already called out above the
            sections, so each tier leads with what the candidate brings. */}
        {MATCH_TYPES.map((group) => {
          const indices = evaluations.flatMap((ev, i) => (ev.match_type === group ? [i] : []));
          if (indices.length === 0) return null;
          const { icon: Icon, iconClass } = matchTypeIcons[group];
          const chipClass = chipClasses[group];
          return (
            <div key={group} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
              <span className="shrink-0 sm:w-32 sm:pt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className={cn("w-3.5 h-3.5", iconClass)} aria-hidden />
                {matchTypeLabels[group]}
                <span className="font-normal tabular-nums">{indices.length}</span>
              </span>
              <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                {indices.map((i) => {
                  const isSelected = selected === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-expanded={isSelected}
                      onClick={() => setSelected(isSelected ? null : i)}
                      className={cn(
                        "max-w-full rounded-md border px-2 py-1 text-left text-xs break-words cursor-pointer transition-colors hover:bg-muted hover:text-foreground",
                        chipClass,
                        isSelected && "bg-muted text-foreground border-foreground/30 border-solid"
                      )}
                    >
                      {evaluations[i].skill_options.join(" / ")}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {/* Inset inside the tier so it reads as belonging to the chip, not
            as a section of its own. Keyed so switching chips resets the
            Reasoning toggle. */}
        {selected !== null && evaluations[selected] && (
          <SkillDetail key={selected} ev={evaluations[selected]} onClose={() => setSelected(null)} />
        )}
      </div>
    </section>
  );
}

export function CandidateBreakdownPanel({
  breakdown,
  isExpanded,
  interview,
  interviewHref,
  onGenerateInterview,
  onReissueInterview,
  onAssessInterview,
  onSendInterviewInvite,
  interviewLocked = false,
}: {
  breakdown: CandidateBreakdown | "loading" | "error" | undefined;
  isExpanded: boolean;
  /** Interview props are optional so surfaces without interview support
   * (e.g. the compare dialog) keep working unchanged. */
  interview?: CachedInterview;
  interviewHref?: string | null;
  onGenerateInterview?: () => Promise<void>;
  onReissueInterview?: () => Promise<void>;
  onAssessInterview?: () => Promise<void>;
  onSendInterviewInvite?: (email: string) => Promise<void>;
  /** Anonymous results page: show the login upsell instead of the callbacks. */
  interviewLocked?: boolean;
}) {
  // undefined = the user hasn't picked yet, so default to the weakest
  // section. Derived rather than set on mount because the breakdown is
  // usually still loading when the panel mounts.
  const [chosenSection, setChosenSection] = useState<BreakdownSection | null | undefined>(undefined);
  const [showAllStrengths, setShowAllStrengths] = useState(false);

  const loaded = breakdown && breakdown !== "loading" && breakdown !== "error" ? breakdown : null;
  const activeSection =
    chosenSection !== undefined ? chosenSection : loaded ? weakestSection(loaded) : null;

  const handleBarClick = (section: BreakdownSection) => {
    setChosenSection(activeSection === section ? null : section);
  };

  return (
    // grid-rows 0fr -> 1fr animates to the content's real height; a max-h
    // cap clipped long skill lists. inert keeps a collapsed panel's
    // controls out of the tab order.
    <div
      inert={!isExpanded}
      className={cn(
        "grid transition-all duration-300",
        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="px-6 py-6 bg-muted/50 border-t border-b border-border space-y-6 w-full">
          {breakdown === "loading" && (
            <div className="flex items-center gap-3 py-4 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Loading breakdown...</span>
            </div>
          )}

          {breakdown === "error" && (
            <div className="flex items-center gap-2 text-error-foreground py-2">
              <X className="w-4 h-4" />
              <span className="text-sm">Failed to load breakdown details.</span>
            </div>
          )}

          {loaded && (
            <>
              {/* breakdown.summary is deliberately not rendered: it is a
                  templated restatement of the scores below, truncated rather
                  than rounded server-side, so it disagreed with the bars. */}

              {/* Score cards double as the section toggles; the chevron and
                  aria-expanded say so. A null score means the JD had no
                  requirement for that component, so the backend dropped it
                  and reweighted the rest: no card, since it would read as 0%. */}
              {(() => {
                const cards = ([
                  { key: "skills" as BreakdownSection, label: "Skills", value: loaded.skill_score, icon: <Zap className="w-4 h-4" /> },
                  { key: "experience" as BreakdownSection, label: "Experience", value: loaded.experience_score, icon: <Briefcase className="w-4 h-4" /> },
                  { key: "education" as BreakdownSection, label: "Education", value: loaded.education_score, icon: <BookOpen className="w-4 h-4" /> },
                ]);
                const scored = cards.filter((c) => c.value != null);
                const unscored = cards.filter((c) => c.value == null).map((c) => c.label.toLowerCase());
                return (
                  <div className="space-y-2">
                    <div
                      className={cn(
                        "grid grid-cols-1 gap-3",
                        scored.length === 3 && "sm:grid-cols-3",
                        scored.length === 2 && "sm:grid-cols-2"
                      )}
                    >
                      {scored.map(({ key, label, value, icon }) => {
                        const isActive = activeSection === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleBarClick(key)}
                            aria-expanded={isActive}
                            className={cn(
                              "text-left rounded-xl p-3 space-y-1.5 border transition-all cursor-pointer select-none",
                              isActive
                                ? "bg-muted border-foreground/20 shadow-sm"
                                : "bg-card/50 border-border/60 hover:border-border hover:bg-card hover:shadow-sm"
                            )}
                          >
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className={cn("flex items-center gap-1.5", isActive ? "text-foreground" : "text-muted-foreground")}>
                                {icon}
                                {label}
                              </span>
                              <span className={cn("flex items-center gap-1", isActive ? "text-foreground" : "text-muted-foreground")}>
                                {value != null ? `${Math.round(value * 100)}%` : "N/A"}
                                <ChevronDown
                                  className={cn("w-3.5 h-3.5 transition-transform", isActive && "rotate-180")}
                                  aria-hidden
                                />
                              </span>
                            </div>
                            {/* Neutral track: the default primary-tinted one put a
                                green wash behind amber and red bars. */}
                            <Progress
                              value={value != null ? Math.round(value * 100) : 0}
                              className={cn("h-2 bg-muted", value != null && scoreBarColor(value))}
                            />
                          </button>
                        );
                      })}
                    </div>
                    {unscored.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {unscored.join(" and ").replace(/^./, (c) => c.toUpperCase())} not scored: the job
                        description sets no requirement for {unscored.length === 1 ? "it" : "them"}.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* The two facts that explain the score, visible without opening
                  a section. A critical gap halves the skill score, so it leads. */}
              {loaded.skills &&
                (loaded.skills.critical_gaps.length > 0 ||
                  loaded.skills.llm_response.strengths.length > 0) && (
                  <div className="space-y-2 text-sm">
                    {loaded.skills.critical_gaps.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-error-foreground mr-0.5">Critical gaps</span>
                        {loaded.skills.critical_gaps.map((gap) => (
                          <Badge
                            key={gap}
                            variant="outline"
                            className="border-error-edge text-foreground whitespace-normal break-words"
                          >
                            {criticalGapLabel(gap, loaded.skills!.llm_response.evaluations)}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {loaded.skills.llm_response.strengths.length > 0 && (() => {
                      const strengths = loaded.skills.llm_response.strengths;
                      const hidden = strengths.length - STRENGTHS_PREVIEW;
                      const shown = showAllStrengths || hidden <= 0 ? strengths : strengths.slice(0, STRENGTHS_PREVIEW);
                      return (
                        <p className="break-words">
                          <span className="font-medium text-foreground">Strengths: </span>
                          <span className="text-muted-foreground">{shown.join(", ")}</span>
                          {hidden > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowAllStrengths((v) => !v)}
                              className="ml-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline cursor-pointer"
                            >
                              {showAllStrengths ? "Show less" : `+${hidden} more`}
                            </button>
                          )}
                        </p>
                      );
                    })()}
                  </div>
                )}

              {/* Skills section */}
              {activeSection === "skills" && loaded.skills && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5" />
                    Skill evaluation
                    {/* Chips don't look like buttons, so say they open. */}
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      Click a skill to see its evidence
                    </span>
                  </h3>

                  <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                    {SKILL_TIERS.map((tier) => {
                      const evsForTier = loaded.skills!.llm_response.evaluations.filter(
                        (ev) => ev.tier === tier
                      );
                      if (evsForTier.length === 0) return null;
                      return <SkillTier key={tier} tier={tier} evaluations={evsForTier} />;
                    })}
                  </div>
                </div>
              )}

              {/* Experience section */}
              {activeSection === "experience" && loaded.experience && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5" />
                    Experience evaluation
                    <span className="ml-auto text-xs text-muted-foreground font-medium">
                      {loaded.experience.effective_years.toFixed(1)} yrs effective
                      {" / "}
                      {loaded.experience.required_years.toFixed(1)} yrs required
                    </span>
                  </h3>

                  {/* Only worth a bar when the candidate falls short; a met
                      requirement would just repeat the full card bar above. */}
                  {loaded.experience.required_years > 0 &&
                    loaded.experience.effective_years < loaded.experience.required_years && (
                      <Progress
                        value={(loaded.experience.effective_years / loaded.experience.required_years) * 100}
                        className={cn(
                          "h-1.5 bg-muted",
                          loaded.experience.effective_years >= loaded.experience.required_years * 0.7
                            ? "[&>div]:bg-warning-bar"
                            : "[&>div]:bg-error-bar"
                        )}
                      />
                    )}

                  {loaded.experience.llm_response.notes && (
                    <p className="text-xs text-muted-foreground break-words">
                      {loaded.experience.llm_response.notes}
                    </p>
                  )}

                  <ul className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                    {loaded.experience.llm_response.evaluations.map((job, i) => {
                      const duration = formatDuration(job.duration_months);
                      return (
                        <li key={i} className="px-3 py-2.5 space-y-1">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <div className="min-w-0">
                              <p className="text-sm break-words">
                                <span className="font-medium text-foreground">{job.job_title}</span>
                                {job.company && (
                                  <span className="text-muted-foreground"> at {job.company}</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatMonth(job.start_date)} – {job.end_date ? formatMonth(job.end_date) : "Present"}
                                {duration && <> · {duration}</>}
                              </p>
                            </div>
                            <Badge variant="outline" className={cn("shrink-0", relevanceStyles[job.relevance])}>
                              {job.relevance} relevance
                            </Badge>
                          </div>
                          <ClampedText text={job.evidence} className="text-xs text-muted-foreground" />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Education section */}
              {activeSection === "education" && loaded.education && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5" />
                    Education evaluation
                  </h3>
                  {(loaded.education.candidate_degree || loaded.education.field_of_study) && (
                    <p className="text-sm font-medium text-foreground break-words">
                      {loaded.education.candidate_degree}
                      {loaded.education.candidate_degree && loaded.education.field_of_study && (
                        <span className="text-muted-foreground font-normal"> in </span>
                      )}
                      {loaded.education.field_of_study}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground break-words">{loaded.education.summary}</p>
                </div>
              )}

              {/* AI interview: surfaces that wire the callbacks, plus the
                  anonymous page, which passes `interviewLocked` and no callbacks. */}
              {((onGenerateInterview && onReissueInterview) || interviewLocked) && (
                <InterviewSection
                  interview={interview}
                  interviewHref={interviewHref ?? null}
                  onGenerate={onGenerateInterview}
                  onReissue={onReissueInterview}
                  onAssess={onAssessInterview}
                  onSendInvite={onSendInterviewInvite}
                  locked={interviewLocked}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
