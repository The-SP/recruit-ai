"use client";

import { BookOpen, Briefcase, Loader2, X, Zap } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  SKILL_TIERS,
  matchTypeLabels,
  matchTypeStyles,
  relevanceStyles,
  scoreBarColor,
  tierSectionStyles,
} from "@/lib/evaluation-styles";
import type { BreakdownSection } from "@/lib/evaluation-types";
import type { CandidateBreakdown } from "@/services/batch";

export function CandidateBreakdownPanel({
  breakdown,
  isExpanded,
}: {
  breakdown: CandidateBreakdown | "loading" | "error" | undefined;
  isExpanded: boolean;
}) {
  const [activeSection, setActiveSection] = useState<BreakdownSection | null>(null);

  const handleBarClick = (section: BreakdownSection) => {
    setActiveSection(prev => prev === section ? null : section);
  };

  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-300",
        isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
      )}
    >
      <div className="px-6 py-6 bg-muted/50 border-t border-border space-y-6 overflow-hidden w-full">
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

        {breakdown && breakdown !== "loading" && breakdown !== "error" && (
          <>
            {breakdown.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {breakdown.summary}
              </p>
            )}

            {/* Clickable score bars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { key: "skills" as BreakdownSection, label: "Skills", value: breakdown.skill_score, icon: <Zap className="w-4 h-4" /> },
                { key: "experience" as BreakdownSection, label: "Experience", value: breakdown.experience_score, icon: <Briefcase className="w-4 h-4" /> },
                { key: "education" as BreakdownSection, label: "Education", value: breakdown.education_score, icon: <BookOpen className="w-4 h-4" /> },
              ]).map(({ key, label, value, icon }) => {
                const isActive = activeSection === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleBarClick(key)}
                    className={cn(
                      "text-left rounded-xl p-3 space-y-1.5 border transition-all cursor-pointer select-none",
                      isActive
                        ? "bg-card border-border shadow-sm"
                        : "bg-card/50 border-border/60 hover:border-border hover:bg-card hover:shadow-sm"
                    )}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className={cn("flex items-center gap-1.5", isActive ? "text-foreground" : "text-muted-foreground")}>
                        {icon}
                        {label}
                      </span>
                      <span className={isActive ? "text-foreground" : "text-muted-foreground"}>
                        {value != null ? `${Math.round(value * 100)}%` : "N/A"}
                      </span>
                    </div>
                    <Progress
                      value={value != null ? Math.round(value * 100) : 0}
                      className={cn("h-2", value != null && scoreBarColor(value))}
                    />
                  </button>
                );
              })}
            </div>

            {/* Skills section */}
            {activeSection === "skills" && breakdown.skills && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" />
                  Skill Evaluation
                </h3>

                {breakdown.skills.critical_gaps.length > 0 && (
                  <div className="text-xs text-error-foreground bg-error border border-error-edge rounded-lg px-3 py-2">
                    <span className="font-bold">Critical gaps: </span>
                    {breakdown.skills.critical_gaps.join(", ")}
                  </div>
                )}

                {SKILL_TIERS.map((tier) => {
                  const evsForTier = breakdown.skills!.llm_response.evaluations.filter(
                    (ev) => ev.tier === tier
                  );
                  if (evsForTier.length === 0) return null;
                  const { label, headerClass } = tierSectionStyles[tier];
                  return (
                    <div key={tier} className="space-y-1.5">
                      <p className={cn("text-[10px] font-bold uppercase tracking-widest", headerClass)}>
                        {label}
                      </p>
                      <div className="space-y-2">
                        {evsForTier.map((ev, i) => (
                          <div key={i} className="bg-card border border-border rounded-xl p-3 space-y-1.5 overflow-hidden">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm text-foreground break-words">
                                {ev.skill_options.join(" / ")}
                              </span>
                              <Badge variant="outline" className={matchTypeStyles[ev.match_type]}>
                                {matchTypeLabels[ev.match_type] || ev.match_type}
                              </Badge>
                            </div>
                            {ev.matched_by && (
                              <p className="text-xs text-muted-foreground break-words">
                                Matched by: <span className="font-medium">{ev.matched_by}</span>
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground break-words">
                              <span className="font-semibold not-italic">Evidence: </span>
                              <span className="italic">{ev.evidence}</span>
                            </p>
                            <p className="text-xs text-muted-foreground break-words">
                              <span className="font-semibold">Reasoning: </span>
                              {ev.reasoning}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {breakdown.skills.llm_response.strengths.length > 0 && (
                  <div className="text-xs text-success-foreground bg-success border border-success-edge rounded-lg px-3 py-2">
                    <span className="font-bold">Strengths: </span>
                    {breakdown.skills.llm_response.strengths.join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Experience section */}
            {activeSection === "experience" && breakdown.experience && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" />
                  Experience Evaluation
                  <span className="ml-auto text-muted-foreground normal-case font-medium">
                    {breakdown.experience.effective_years.toFixed(1)} yrs effective
                    {" / "}
                    {breakdown.experience.required_years.toFixed(1)} yrs required
                  </span>
                </h3>

                {/* Experience requirement progress bar */}
                {breakdown.experience.required_years > 0 && (
                  <div className="space-y-1">
                    <Progress
                      value={Math.min(
                        (breakdown.experience.effective_years / breakdown.experience.required_years) * 100,
                        100
                      )}
                      className={cn(
                        "h-1.5",
                        breakdown.experience.effective_years >= breakdown.experience.required_years
                          ? "[&>div]:bg-success-bar"
                          : breakdown.experience.effective_years >= breakdown.experience.required_years * 0.7
                          ? "[&>div]:bg-warning-bar"
                          : "[&>div]:bg-error-bar"
                      )}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {breakdown.experience.llm_response.evaluations.map((job, i) => (
                    <div key={i} className="bg-card border border-border rounded-xl p-3 space-y-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-sm text-foreground break-words">{job.job_title}</span>
                          {job.company && (
                            <span className="text-xs text-muted-foreground ml-2">@ {job.company}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{job.duration_months} mo</span>
                          <Badge variant="outline" className={relevanceStyles[job.relevance]}>
                            {job.relevance} relevance
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground italic break-words">{job.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education section */}
            {activeSection === "education" && breakdown.education && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5" />
                  Education
                </h3>
                <div className="bg-card border border-border rounded-xl p-3 space-y-1">
                  {breakdown.education.candidate_degree && (
                    <p className="text-sm font-medium text-foreground">
                      {breakdown.education.candidate_degree}
                      {breakdown.education.field_of_study && (
                        <span className="text-muted-foreground font-normal">
                          {" — "}{breakdown.education.field_of_study}
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{breakdown.education.summary}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
