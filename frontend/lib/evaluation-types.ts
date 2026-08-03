export type SortBy = "score_desc" | "name_asc" | "name_desc";
export type BreakdownSection = "skills" | "experience" | "education";

export const MAX_COMPARE = 4;

// Shared shape of a candidate row across both results pages. CandidateResult
// (services/batch.ts) and RunItemSummary (services/runs.ts) are both assignable
// to this — the presentational components accept either.
/**
 * Trial cap on the anonymous flow, mirroring MAX_ANONYMOUS_RESUMES in
 * backend/app/core/file_upload.py. Signed-in runs are uncapped. The backend
 * enforces this; the client copy exists so people aren't surprised after
 * picking files.
 */
export const MAX_ANONYMOUS_RESUMES = 5;

export interface EvaluationItem {
  item_id: string;
  candidate_id: string | null;
  candidate_name: string | null;
  filename: string;
  final_score: number | null;
  hire_signal: string | null;
  status: string;
}

// The right-side resume panel state, shared by both pages.
export interface ResumePanelState {
  name: string | null;
  filename: string;
  markdown: string;
}
