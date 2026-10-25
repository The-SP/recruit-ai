import { CircleCheck, CircleDashed, Contrast, type LucideIcon } from "lucide-react";

import type { SkillGroupDetail } from "@/services/batch";

export const statusStyles: Record<string, string> = {
  completed: "bg-success text-success-foreground border-success-edge",
  processing: "bg-info text-info-foreground border-info-edge",
  pending: "bg-warning text-warning-foreground border-warning-edge",
  failed: "bg-error text-error-foreground border-error-edge",
};

export const statusLabels: Record<string, string> = {
  completed: "Completed",
  processing: "Processing",
  pending: "Pending",
  failed: "Failed",
  draft: "Draft",
};

export const signalStyles: Record<string, string> = {
  strong_match: "bg-success text-success-foreground border-success-edge",
  good_match: "bg-info text-info-foreground border-info-edge",
  partial_match: "bg-warning text-warning-foreground border-warning-edge",
  weak_match: "bg-warning text-warning-foreground border-warning-edge",
  no_match: "bg-error text-error-foreground border-error-edge",
};

export const signalLabels: Record<string, string> = {
  strong_match: "Strong match",
  good_match: "Good match",
  partial_match: "Partial match",
  weak_match: "Weak match",
  no_match: "No match",
};

export const matchTypeStyles: Record<string, string> = {
  exact: "bg-success text-success-foreground border-success-edge",
  partial: "bg-warning text-warning-foreground border-warning-edge",
  none: "bg-muted text-muted-foreground border-border",
};

export const matchTypeLabels: Record<string, string> = {
  exact: "Exact match",
  partial: "Partial match",
  none: "No match",
};

// Best first: the breakdown panel's rows and the compare summary both read
// in this order.
export const MATCH_TYPES = ["exact", "partial", "none"] as const;

// Icon form of a match type, for places too dense for a labelled badge (the
// panel's row labels, the compare matrix cells).
export const matchTypeIcons: Record<
  (typeof MATCH_TYPES)[number],
  { icon: LucideIcon; iconClass: string; barClass: string }
> = {
  exact: { icon: CircleCheck, iconClass: "text-success-foreground", barClass: "bg-success-bar" },
  partial: { icon: Contrast, iconClass: "text-warning-foreground", barClass: "bg-warning-bar" },
  none: { icon: CircleDashed, iconClass: "text-muted-foreground", barClass: "bg-muted-foreground/25" },
};

/** The resume's name for a matched skill, or null when it adds nothing: a
 * miss has nothing to cite (the model often fills in "N/A" anyway), and
 * "via Python" on a Python row is noise. */
export function matchedByText(ev: SkillGroupDetail): string | null {
  if (ev.match_type === "none" || !ev.matched_by) return null;
  const by = ev.matched_by.trim().toLowerCase();
  return ev.skill_options.some((o) => o.trim().toLowerCase() === by) ? null : ev.matched_by;
}

/** critical_gaps arrives as each group's options joined with ", ", so the
 * joined list read as one gap per option. Map back to the evaluation to
 * show one label per requirement. */
export function criticalGapLabel(gap: string, evaluations: SkillGroupDetail[]): string {
  const ev = evaluations.find(
    (e) => e.tier === "critical" && e.skill_options.join(", ") === gap
  );
  return ev ? ev.skill_options.join(" / ") : gap;
}

// Amber is reserved for "waiting on the user", so the middle grade is blue.
export const relevanceStyles: Record<string, string> = {
  high: "bg-success text-success-foreground border-success-edge",
  medium: "bg-info text-info-foreground border-info-edge",
  low: "bg-muted text-muted-foreground border-border",
  none: "bg-muted text-muted-foreground border-border",
};

export const interviewStatusStyles: Record<string, string> = {
  // Awaiting a human. Deliberately the only dashed badge here: every other
  // status describes something that happened, this one describes something
  // the recruiter still has to do.
  draft: "bg-warning text-warning-foreground border-warning-edge border-dashed",
  created: "bg-info text-info-foreground border-info-edge",
  in_progress: "bg-warning text-warning-foreground border-warning-edge",
  completed: "bg-success text-success-foreground border-success-edge",
  assessed: "bg-success text-success-foreground border-success-edge",
  expired: "bg-muted text-muted-foreground border-border",
};

export const interviewStatusLabels: Record<string, string> = {
  draft: "Needs review",
  created: "Link ready",
  in_progress: "In progress",
  completed: "Completed",
  assessed: "Assessed",
  expired: "Expired",
};

/** What a question is for, in recruiter language. Read by both question
 * editors so a focus can't be labelled one way on a fixed question and another
 * on a generated one. Never shown to the candidate — focus is rubric. */
export const questionFocusLabels: Record<string, string> = {
  experience_depth: "Experience",
  role_competency: "Role skill",
  gap_probe: "Gap",
};

export const interviewModeLabels: Record<string, string> = {
  text: "Text interview",
  audio: "Voice interview",
};

export const recommendationStyles: Record<string, string> = {
  advance: "bg-success text-success-foreground border-success-edge",
  borderline: "bg-warning text-warning-foreground border-warning-edge",
  do_not_advance: "bg-error text-error-foreground border-error-edge",
};

export const recommendationLabels: Record<string, string> = {
  advance: "Advance",
  borderline: "Borderline",
  do_not_advance: "Do not advance",
};

export const competencyLabels: Record<string, string> = {
  technical_depth: "Technical depth",
  ownership_impact: "Ownership & impact",
};

/** One word per competency level. Null is "not enough evidence": the assessor
 * found no answer to rate it on, which is not the same as a low rating. */
export function levelLabel(level: number | null): string {
  if (level === null) return "Not enough evidence";
  return ["Weak", "Limited", "Moderate", "Good", "Strong"][level - 1] ?? String(level);
}

export function scoreBarColor(value: number): string {
  if (value >= 0.7) return "[&>div]:bg-success-bar";
  if (value >= 0.5) return "[&>div]:bg-warning-bar";
  return "[&>div]:bg-error-bar";
}

export const SKILL_TIERS = ["critical", "required", "preferred"] as const;

export const tierSectionStyles: Record<string, { label: string; headerClass: string }> = {
  critical: { label: "Critical", headerClass: "text-error-foreground" },
  required: { label: "Required", headerClass: "text-info-foreground" },
  preferred: { label: "Preferred", headerClass: "text-foreground" },
};
