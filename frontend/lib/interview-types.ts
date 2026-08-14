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
  /** A recording is attached to this answer. The path never crosses the API;
   * recruiters fetch bytes from the JWT-gated endpoint. */
  has_audio?: boolean;
  /** Which synthesized clip speaks this interviewer turn. A slot name, not a
   * storage path, and only meaningful together with the invite token. Null on
   * candidate turns and on every turn when the interview's voice is off. */
  voice_key?: string | null;
}

/** How the candidate answers. Snapshotted per interview at creation, so it is
 * read from the interview, never from a client-side flag. */
export type InterviewMode = "text" | "audio";

/** Whether the interviewer's turns are read aloud. Snapshotted per interview
 * exactly like InterviewMode, and read the same way — an invite minted while
 * voice was on keeps its audio after the deployment flips it off. */
export type InterviewVoice = "on" | "off";

/** Candidate-facing state; mirrors InterviewStateResponse. */
export interface InterviewState {
  status: string;
  answer_mode: InterviewMode;
  voice_mode: InterviewVoice;
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

/** What a question is for. Mirrors the backend QuestionFocus enum; the
 * recruiter picks one when writing a fixed question. */
export type QuestionFocus = "experience_depth" | "role_competency" | "gap_probe";

/** A question the recruiter wrote, asked verbatim of every candidate in the
 * run. Carries focus and subject because the assessor grades against both. */
export interface FixedQuestionData {
  text: string;
  focus: QuestionFocus;
  subject: string;
}

/** Per-run interview template; mirrors InterviewTemplateResponse.
 *
 * Editable at any time: every interview snapshots its script and settings at
 * approval, so a change here only reaches interviews drafted afterward. */
export interface InterviewTemplateData {
  run_id: string;
  /** False when nothing is stored yet and these are the deployment defaults
   * generation would use. The endpoint always returns a body, so the client
   * never has to invent a question count of its own. */
  is_saved: boolean;
  question_count: number;
  followups_enabled: boolean;
  /** Null means "let the model write it". */
  opening: string | null;
  closing: string | null;
  fixed_questions: FixedQuestionData[];
  /** Null until the recruiter saves one. */
  updated_at: string | null;
}

/** Response of draft/approve/reissue; mirrors InterviewSummaryResponse.
 *
 * invite_url, access_token and expires_at are null while the interview is a
 * draft — there is no link to send until a human approves the questions. */
export interface InterviewSummary {
  interview_id: string;
  status: string;
  invite_url: string | null;
  access_token: string | null;
  questions_count: number;
  expires_at: string | null;
  created_at: string;
  approved_at: string | null;
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
  /** Null while draft — see InterviewSummary. */
  invite_url: string | null;
  access_token: string | null;
  model_name: string;
  answer_mode: InterviewMode;
  voice_mode: InterviewVoice;
  /** Whether the engine may ask adaptive follow-ups. Snapshotted from the
   * template at approval, like answer_mode and voice_mode. */
  followups_enabled: boolean;
  /** The script's greeting and sign-off. Present even on a draft, which has
   * no turns to read them from. */
  opening: string;
  closing: string;
  questions_count: number;
  current_question_index: number;
  questions: InterviewQuestionData[];
  turns: InterviewTurnData[];
  assessment: InterviewAssessmentData | null;
  assessment_error: string | null;
  expires_at: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  assessed_at: string | null;
  created_at: string;
}

/** Cache slot value for a row's interview: null = fetched, none exists. */
export type CachedInterview = InterviewDetail | "loading" | "error" | null;
