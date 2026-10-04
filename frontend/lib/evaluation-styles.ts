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

export const relevanceStyles: Record<string, string> = {
  high: "bg-success text-success-foreground border-success-edge",
  medium: "bg-warning text-warning-foreground border-warning-edge",
  low: "bg-warning text-warning-foreground border-warning-edge",
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
  created: "Invite sent",
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

export const answerQualityStyles: Record<string, string> = {
  strong: "bg-success text-success-foreground border-success-edge",
  adequate: "bg-info text-info-foreground border-info-edge",
  weak: "bg-warning text-warning-foreground border-warning-edge",
  not_answered: "bg-muted text-muted-foreground border-border",
};

export const answerQualityLabels: Record<string, string> = {
  strong: "Strong",
  adequate: "Adequate",
  weak: "Weak",
  not_answered: "Not answered",
};

export function scoreBarColor(value: number): string {
  if (value >= 0.7) return "[&>div]:bg-success-bar";
  if (value >= 0.5) return "[&>div]:bg-warning-bar";
  return "[&>div]:bg-error-bar";
}

export const SKILL_TIERS = ["critical", "required", "preferred"] as const;

export const tierSectionStyles: Record<string, { label: string; headerClass: string }> = {
  critical: { label: "Critical", headerClass: "text-error-foreground" },
  required: { label: "Required", headerClass: "text-info-foreground" },
  preferred: { label: "Preferred", headerClass: "text-muted-foreground" },
};
