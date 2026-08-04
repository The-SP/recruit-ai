/**
 * Structural interview types shared by both service flavors (batch token and
 * owned run) and the presentational components, mirroring how
 * evaluation-types.ts keeps the results UI service-agnostic.
 */

/** One transcript turn; mirrors the backend TurnOut schema. */
export interface InterviewTurnData {
  seq: number;
  role: "interviewer" | "candidate";
  kind: "opening" | "question" | "followup" | "answer" | "closing";
  question_index: number | null;
  content: string;
  created_at: string;
}

/** Candidate-facing state; mirrors InterviewStateResponse. */
export interface InterviewState {
  status: string;
  job_title: string | null;
  company_name: string | null;
  question_number: number;
  total_questions: number;
  time_remaining_seconds: number | null;
  turns: InterviewTurnData[];
}

/** SSE `state` event payload (InterviewState minus the transcript and the
 * grounding fields). Derived from InterviewState so the two can't drift —
 * the candidate page spreads this straight onto the state it holds. */
export type InterviewStateEvent = Pick<
  InterviewState,
  "status" | "question_number" | "total_questions" | "time_remaining_seconds"
>;

/** Recruiter-only question view (contains the rubric). */
export interface InterviewQuestionData {
  id: number;
  text: string;
  focus: string;
  subject: string;
}

/** Response of create/reissue; mirrors InterviewSummaryResponse. */
export interface InterviewSummary {
  interview_id: string;
  status: string;
  invite_url: string;
  access_token: string;
  questions_count: number;
  expires_at: string;
  created_at: string;
}

/** Per-question verdict; mirrors the backend QuestionAssessment schema. */
export interface QuestionAssessmentData {
  question_id: number;
  focus: string;
  subject: string;
  answer_quality: "strong" | "adequate" | "weak" | "not_answered";
  resume_consistency: "consistent" | "inconsistent" | "not_applicable";
  evidence: string;
  notes: string;
}

/** Whole-transcript verdict; mirrors InterviewAssessment (stored as JSONB). */
export interface InterviewAssessmentData {
  per_question: QuestionAssessmentData[];
  competency_summary: string;
  strengths: string[];
  concerns: string[];
  gap_findings: string | null;
  overall_summary: string;
  recommendation: "advance" | "borderline" | "do_not_advance";
}

/** Recruiter-facing detail; mirrors InterviewDetailResponse. */
export interface InterviewDetail {
  interview_id: string;
  status: string;
  invite_url: string;
  access_token: string;
  model_name: string;
  questions_count: number;
  current_question_index: number;
  questions: InterviewQuestionData[];
  turns: InterviewTurnData[];
  assessment: InterviewAssessmentData | null;
  assessment_error: string | null;
  expires_at: string;
  started_at: string | null;
  completed_at: string | null;
  assessed_at: string | null;
  created_at: string;
}

/** Cache slot value for a row's interview: null = fetched, none exists. */
export type CachedInterview = InterviewDetail | "loading" | "error" | null;
