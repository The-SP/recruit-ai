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
  /** Null only on the candidate surface, for a spoken answer: the candidate
   * never sees their own transcript. Recruiters always get the text. */
  content: string | null;
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

/** The fixed axes every candidate is rated on; mirrors the backend
 * Competency enum. */
export type Competency = "technical_depth" | "ownership_impact";

/** What levels 1, 3 and 5 look like for one competency. */
export interface CompetencyLevelsData {
  level_1: string;
  level_3: string;
  level_5: string;
}

/** Level descriptions for every competency; mirrors LevelDescriptions. */
export type LevelDescriptionsData = Record<Competency, CompetencyLevelsData>;

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
  /** Wall clock for interviews drafted from this template, in seconds. */
  time_limit_seconds: number;
  /** The durations the server accepts, so the picker can't offer one that
   * would be rejected. Served with the template rather than hardcoded here. */
  allowed_time_limits: number[];
  /** Null means "let the model write it". */
  opening: string | null;
  closing: string | null;
  fixed_questions: FixedQuestionData[];
  /** What the assessor rates against: the template's own wording, or the
   * defaults when it set none. Always filled. */
  level_descriptions: LevelDescriptionsData;
  /** The code defaults, served so "Reset to default" needs no local copy. */
  default_level_descriptions: LevelDescriptionsData;
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
  invite_sent_to: string | null;
  invite_sent_at: string | null;
}

/** Findings for one core question; mirrors the backend QuestionAssessment.
 * Carries no quality label: judgement lives on the competencies. */
export interface QuestionAssessmentData {
  question_id: number;
  focus: string;
  subject: string;
  notes: string;
  resume_consistency: "supported" | "contradicted" | "not_tested";
  /** The resume line the answer contradicts; empty unless contradicted. */
  resume_quote: string;
}

/** One competency rated across the whole interview; mirrors CompetencyRating. */
export interface CompetencyRatingData {
  name: Competency;
  /** question_ids of the answers that moved this rating, up or down. */
  seen_in: number[];
  rationale: string;
  /** 1-5, or null when no answer gave evidence for it. */
  level: number | null;
}

/** Whole-transcript verdict; mirrors InterviewAssessment (stored as JSONB).
 * The recommendation is derived in code from the competency levels. */
export interface InterviewAssessmentData {
  per_question: QuestionAssessmentData[];
  competencies: CompetencyRatingData[];
  strengths: string[];
  concerns: string[];
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
  /** This interview's snapshotted wall clock, in seconds. */
  time_limit_seconds: number;
  /** The script's greeting and sign-off. Present even on a draft, which has
   * no turns to read them from. */
  opening: string;
  closing: string;
  questions_count: number;
  current_question_index: number;
  questions: InterviewQuestionData[];
  turns: InterviewTurnData[];
  assessment: InterviewAssessmentData | null;
  /** Why the recommendation is what it is; computed per request from the
   * stored levels by the same rule that derived it. */
  recommendation_reasons: string[];
  assessment_error: string | null;
  expires_at: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  assessed_at: string | null;
  created_at: string;
  /** Parsed from the resume; prefills the send-invite field. */
  candidate_email: string | null;
  /** Where and when an invite email went out for the current link. Null
   * until one is sent, and cleared again by a reissue. */
  invite_sent_to: string | null;
  invite_sent_at: string | null;
}

/** Cache slot value for a row's interview: null = fetched, none exists. */
export type CachedInterview = InterviewDetail | "loading" | "error" | null;
