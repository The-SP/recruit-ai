"use client";

import { BookOpen, Briefcase, Loader2, X, Zap } from "lucide-react";
import React from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  SKILL_TIERS,
  matchTypeLabels,
  matchTypeStyles,
  scoreBarColor,
  signalLabels,
  signalStyles,
  tierSectionStyles,
} from "@/lib/evaluation-styles";
import { cn } from "@/lib/utils";
import type { EvaluationItem } from "@/lib/evaluation-types";
import { CandidateBreakdown, SkillGroupDetail } from "@/services/batch";

type CachedBreakdown = CandidateBreakdown | "loading" | "error" | undefined;

// Tier headers render as badges (bg + matching foreground) so they stay
// legible on the plain matrix background in both light and dark themes —
// tierSectionStyles' bare text colors are tuned for colored badge fills.
const tierBadgeStyles: Record<string, string> = {
  critical: "bg-error text-error-foreground border-error-edge",
  required: "bg-info text-info-foreground border-info-edge",
  preferred: "bg-muted text-muted-foreground border-border",
};

// The dialog only needs these fields; both page item types (via EvaluationItem)
// satisfy it.
export type CompareCandidate = Pick<
  EvaluationItem,
  "candidate_id" | "candidate_name" | "filename" | "final_score" | "hire_signal"
>;

interface CandidateCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: CompareCandidate[];
  breakdowns: Record<string, CandidateBreakdown | "loading" | "error">;
  onRemove: (candidateId: string) => void;
}

function loaded(bd: CachedBreakdown): CandidateBreakdown | null {
  return bd && bd !== "loading" && bd !== "error" ? bd : null;
}

function LabelCell({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky left-0 z-10 bg-background px-4 py-3 text-xs font-semibold text-muted-foreground flex items-center gap-1.5 border-b border-border",
        className
      )}
    >
      {children}
    </div>
  );
}

function ValueCell({
  children,
  isBest,
  className,
}: {
  children?: React.ReactNode;
  isBest?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-4 py-3 border-b border-l border-border text-sm",
        isBest && "bg-success/40 shadow-[inset_0_0_0_1px_var(--success-edge)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function PendingCell({ bd }: { bd: CachedBreakdown }) {
  if (bd === "loading") {
    return <div className="h-3.5 w-16 rounded bg-muted animate-pulse" />;
  }
  return <span className="text-muted-foreground">—</span>;
}

function ScoreRow({
  label,
  icon,
  candidates,
  breakdowns,
  getScore,
}: {
  label: string;
  icon: React.ReactNode;
  candidates: CompareCandidate[];
  breakdowns: Record<string, CandidateBreakdown | "loading" | "error">;
  getScore: (bd: CandidateBreakdown) => number | null;
}) {
  const scores = candidates.map((c) => {
    const bd = c.candidate_id ? loaded(breakdowns[c.candidate_id]) : null;
    return bd ? getScore(bd) : null;
  });
  const valid = scores.filter((s): s is number => s != null);
  const best = valid.length >= 2 ? Math.max(...valid) : null;

  return (
    <>
      <LabelCell>
        {icon}
        {label}
      </LabelCell>
      {candidates.map((c, i) => {
        const score = scores[i];
        const bd = c.candidate_id ? breakdowns[c.candidate_id] : undefined;
        return (
          <ValueCell key={c.candidate_id ?? i} isBest={best != null && score === best}>
            {score != null ? (
              <div className="flex items-center gap-2">
                <span className="font-bold tabular-nums w-10">{Math.round(score * 100)}%</span>
                <Progress
                  value={Math.round(score * 100)}
                  className={cn("h-1.5 flex-1", scoreBarColor(score))}
                />
              </div>
            ) : (
              <PendingCell bd={bd} />
            )}
          </ValueCell>
        );
      })}
    </>
  );
}

export function CandidateCompareDialog({
  open,
  onOpenChange,
  candidates,
  breakdowns,
  onRemove,
}: CandidateCompareDialogProps) {
  const n = candidates.length;

  // Union of skill requirement groups across candidates, grouped by tier.
  // Skill groups come from the job requirements, so they align across
  // candidates by their skill_options key.
  const skillRows = React.useMemo(() => {
    const byTier = new Map<string, { key: string; label: string }[]>();
    const seen = new Set<string>();
    for (const c of candidates) {
      const bd = c.candidate_id ? loaded(breakdowns[c.candidate_id]) : null;
      if (!bd?.skills) continue;
      for (const ev of bd.skills.llm_response.evaluations) {
        const key = `${ev.tier}::${ev.skill_options.join(" / ")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const rows = byTier.get(ev.tier) ?? [];
        rows.push({ key, label: ev.skill_options.join(" / ") });
        byTier.set(ev.tier, rows);
      }
    }
    return byTier;
  }, [candidates, breakdowns]);

  const skillLookup = React.useMemo(() => {
    const lookup = new Map<string, Map<string, SkillGroupDetail>>();
    for (const c of candidates) {
      if (!c.candidate_id) continue;
      const bd = loaded(breakdowns[c.candidate_id]);
      if (!bd?.skills) continue;
      const map = new Map<string, SkillGroupDetail>();
      for (const ev of bd.skills.llm_response.evaluations) {
        map.set(`${ev.tier}::${ev.skill_options.join(" / ")}`, ev);
      }
      lookup.set(c.candidate_id, map);
    }
    return lookup;
  }, [candidates, breakdowns]);

  const finalScores = candidates.map((c) => c.final_score);
  const validFinal = finalScores.filter((s): s is number => s != null);
  const bestFinal = validFinal.length >= 2 ? Math.max(...validFinal) : null;

  const anyError = candidates.some(
    (c) => c.candidate_id && breakdowns[c.candidate_id] === "error"
  );

  const sectionHeader = (label: string, extraClass?: string) => (
    <div
      className={cn(
        "px-4 py-2 bg-muted/60 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground",
        extraClass
      )}
      style={{ gridColumn: `1 / span ${n + 1}` }}
    >
      {label}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] lg:max-w-6xl h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-bold">
            Compare Candidates ({n})
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div
            className="grid min-w-fit"
            style={{ gridTemplateColumns: `150px repeat(${n}, minmax(200px, 1fr))` }}
          >
            {/* Candidate header row */}
            <LabelCell className="bg-background" />
            {candidates.map((c, i) => (
              <ValueCell key={c.candidate_id ?? i} className="py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate">
                      {c.candidate_name ?? c.filename}
                    </p>
                    {c.candidate_name && (
                      <p className="text-xs text-muted-foreground truncate">{c.filename}</p>
                    )}
                  </div>
                  {c.candidate_id && (
                    <button
                      onClick={() => onRemove(c.candidate_id!)}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 cursor-pointer"
                      title="Remove from comparison"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </ValueCell>
            ))}

            {/* Overall */}
            <LabelCell>Overall Score</LabelCell>
            {candidates.map((c, i) => (
              <ValueCell
                key={c.candidate_id ?? i}
                isBest={bestFinal != null && c.final_score === bestFinal}
              >
                {c.final_score != null ? (
                  <div className="flex items-center gap-2">
                    <span className="font-bold tabular-nums w-10">
                      {Math.round(c.final_score * 100)}%
                    </span>
                    <Progress
                      value={Math.round(c.final_score * 100)}
                      className={cn("h-1.5 flex-1", scoreBarColor(c.final_score))}
                    />
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </ValueCell>
            ))}

            <LabelCell>Hire Signal</LabelCell>
            {candidates.map((c, i) => (
              <ValueCell key={c.candidate_id ?? i}>
                {c.hire_signal ? (
                  <Badge variant="outline" className={signalStyles[c.hire_signal]}>
                    {signalLabels[c.hire_signal] || c.hire_signal}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </ValueCell>
            ))}

            {/* Sub-scores */}
            {sectionHeader("Component Scores")}
            <ScoreRow
              label="Skills"
              icon={<Zap className="w-3.5 h-3.5" />}
              candidates={candidates}
              breakdowns={breakdowns}
              getScore={(bd) => bd.skill_score}
            />
            <ScoreRow
              label="Experience"
              icon={<Briefcase className="w-3.5 h-3.5" />}
              candidates={candidates}
              breakdowns={breakdowns}
              getScore={(bd) => bd.experience_score}
            />
            <ScoreRow
              label="Education"
              icon={<BookOpen className="w-3.5 h-3.5" />}
              candidates={candidates}
              breakdowns={breakdowns}
              getScore={(bd) => bd.education_score}
            />

            {/* Skill matrix */}
            {skillRows.size > 0 && sectionHeader("Skill Matrix")}
            {SKILL_TIERS.map((tier) => {
              const rows = skillRows.get(tier);
              if (!rows || rows.length === 0) return null;
              const { label } = tierSectionStyles[tier];
              return (
                <React.Fragment key={tier}>
                  <div
                    className="px-4 py-2 bg-muted/40 border-b border-border"
                    style={{ gridColumn: `1 / span ${n + 1}` }}
                  >
                    <span
                      className={cn(
                        "inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                        tierBadgeStyles[tier]
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {rows.map((row) => (
                    <React.Fragment key={row.key}>
                      <LabelCell className="text-foreground font-medium normal-case">
                        {row.label}
                      </LabelCell>
                      {candidates.map((c, i) => {
                        const bd = c.candidate_id ? breakdowns[c.candidate_id] : undefined;
                        const ev = c.candidate_id
                          ? skillLookup.get(c.candidate_id)?.get(row.key)
                          : undefined;
                        return (
                          <ValueCell key={c.candidate_id ?? i}>
                            {ev ? (
                              <div className="space-y-1">
                                <Badge
                                  variant="outline"
                                  className={matchTypeStyles[ev.match_type]}
                                  title={ev.reasoning}
                                >
                                  {matchTypeLabels[ev.match_type] || ev.match_type}
                                </Badge>
                                {ev.matched_by && ev.match_type !== "none" && (
                                  <p className="text-xs text-muted-foreground break-words">
                                    via {ev.matched_by}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <PendingCell bd={bd} />
                            )}
                          </ValueCell>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              );
            })}

            {/* Experience */}
            {sectionHeader("Experience")}
            <LabelCell>
              <Briefcase className="w-3.5 h-3.5" />
              Years
            </LabelCell>
            {candidates.map((c, i) => {
              const bd = c.candidate_id ? breakdowns[c.candidate_id] : undefined;
              const exp = loaded(bd)?.experience;
              return (
                <ValueCell key={c.candidate_id ?? i}>
                  {exp ? (
                    <div className="space-y-1.5">
                      <p className="text-sm">
                        <span className="font-bold tabular-nums">
                          {exp.effective_years.toFixed(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {" "}yrs effective / {exp.required_years.toFixed(1)} required
                        </span>
                      </p>
                      {exp.required_years > 0 && (
                        <Progress
                          value={Math.min(
                            (exp.effective_years / exp.required_years) * 100,
                            100
                          )}
                          className={cn(
                            "h-1.5",
                            exp.effective_years >= exp.required_years
                              ? "[&>div]:bg-success-bar"
                              : exp.effective_years >= exp.required_years * 0.7
                              ? "[&>div]:bg-warning-bar"
                              : "[&>div]:bg-error-bar"
                          )}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        {exp.llm_response.evaluations.length} position
                        {exp.llm_response.evaluations.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  ) : (
                    <PendingCell bd={bd} />
                  )}
                </ValueCell>
              );
            })}

            {/* Education */}
            {sectionHeader("Education")}
            <LabelCell>
              <BookOpen className="w-3.5 h-3.5" />
              Degree
            </LabelCell>
            {candidates.map((c, i) => {
              const bd = c.candidate_id ? breakdowns[c.candidate_id] : undefined;
              const edu = loaded(bd)?.education;
              return (
                <ValueCell key={c.candidate_id ?? i}>
                  {edu ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {edu.candidate_degree ?? "—"}
                        {edu.field_of_study && (
                          <span className="text-muted-foreground font-normal">
                            {" — "}{edu.field_of_study}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{edu.summary}</p>
                    </div>
                  ) : (
                    <PendingCell bd={bd} />
                  )}
                </ValueCell>
              );
            })}
          </div>

          {anyError && (
            <div className="mx-6 my-4 flex items-center gap-2 text-error-foreground text-sm">
              <X className="w-4 h-4 shrink-0" />
              Some candidates failed to load their breakdown details.
            </div>
          )}

          {candidates.some(
            (c) => c.candidate_id && breakdowns[c.candidate_id] === "loading"
          ) && (
            <div className="mx-6 my-4 flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              Loading breakdown details...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
