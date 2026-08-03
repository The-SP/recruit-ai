import {
  IS_DEMO_MODE,
  demoAddCandidates,
  demoCreateInterview,
  demoGetBatchStatus,
  demoGetCandidateBreakdown,
  demoGetInterview,
  demoRetryFailed,
  demoSubmitBatch,
} from "@/lib/demo";
import type { InterviewDetail, InterviewSummary } from "@/lib/interview-types";

import { ApiError, apiRequest } from "./api";

// Types
export interface SubmitBatchResponse {
  token: string;
  uploaded: number;
  failed: number;
  errors: string[];
}

export interface BatchStatus {
  run_id: string;
  status: "draft" | "pending" | "processing" | "completed" | "failed";
  progress: {
    total: number;
    processed: number;
    failed: number;
  };
  job: {
    title: string | null;
    company_name: string | null;
  } | null;
  results: CandidateResult[];
  processing_time_seconds: number | null;
  created_at: string;
}

export interface CandidateResult {
  item_id: string;
  candidate_id: string | null;
  candidate_name: string | null;
  filename: string;
  final_score: number | null;
  hire_signal: string | null;
  status: string;
}

// Candidate breakdown types (mirrors backend internal schemas)
export interface SkillGroupDetail {
  skill_options: string[];
  tier: "critical" | "required" | "preferred";
  match_type: "exact" | "partial" | "none";
  matched_by: string | null;
  evidence: string;
  reasoning: string;
}

export interface SkillBreakdown {
  llm_response: {
    evaluations: SkillGroupDetail[];
    strengths: string[];
  };
  required_score: number;
  preferred_score: number;
  critical_gaps: string[];
  critical_penalty: number;
  final_score: number;
  summary: string;
}

export interface ExperienceJobDetail {
  job_title: string;
  company: string | null;
  start_date: string;
  end_date: string | null;
  duration_months: number;
  relevance: "high" | "medium" | "low" | "none";
  evidence: string;
}

export interface ExperienceBreakdown {
  llm_response: {
    evaluations: ExperienceJobDetail[];
    notes: string | null;
  };
  effective_months: number;
  effective_years: number;
  required_years: number;
  experience_score: number;
  summary: string;
}

export interface EducationBreakdown {
  score: number;
  candidate_degree: string | null;
  field_of_study: string | null;
  summary: string;
}

export interface CandidateBreakdown {
  candidate_id: string;
  candidate_name: string | null;
  filename: string;
  final_score: number | null;
  hire_signal: string | null;
  skill_score: number | null;
  experience_score: number | null;
  education_score: number | null;
  summary: string | null;
  skills: SkillBreakdown | null;
  experience: ExperienceBreakdown | null;
  education: EducationBreakdown | null;
  resume_markdown?: string | null;
}

export interface HistoryItem {
  token: string;
  job_title: string | null;
  company_name: string | null;
  candidate_count: number;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
}

export interface HistoryListResponse {
  items: HistoryItem[];
  total: number;
}

export interface AddCandidatesResponse {
  uploaded: number;
  failed: number;
  errors: string[];
  run_status: string;
}

export interface RetryFailedResponse {
  retried: number;
  run_status: string;
}

// API functions
export async function submitBatch(
  jobText: string,
  email: string,
  files: File[]
): Promise<SubmitBatchResponse> {
  if (IS_DEMO_MODE) return demoSubmitBatch();

  const formData = new FormData();
  formData.append("job_text", jobText);
  formData.append("email", email);
  files.forEach((file) => formData.append("files", file));

  return apiRequest<SubmitBatchResponse>("/batch/submit", {
    method: "POST",
    body: formData,
  });
}

export async function getBatchStatus(token: string): Promise<BatchStatus> {
  if (IS_DEMO_MODE) return demoGetBatchStatus();

  return apiRequest<BatchStatus>(`/batch/status/${token}`);
}

export async function getCandidateBreakdown(
  token: string,
  candidateId: string
): Promise<CandidateBreakdown> {
  if (IS_DEMO_MODE) return demoGetCandidateBreakdown(candidateId);

  return apiRequest<CandidateBreakdown>(
    `/batch/status/${token}/candidate/${candidateId}`
  );
}

export async function getHistory(limit = 50): Promise<HistoryListResponse> {
  return apiRequest<HistoryListResponse>(`/batch/history?limit=${limit}`);
}

export async function addCandidatesToBatch(
  token: string,
  files: File[]
): Promise<AddCandidatesResponse> {
  if (IS_DEMO_MODE) return demoAddCandidates();

  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return apiRequest<AddCandidatesResponse>(
    `/batch/status/${token}/add-candidates`,
    { method: "POST", body: formData }
  );
}

export async function retryAllFailed(token: string): Promise<RetryFailedResponse> {
  if (IS_DEMO_MODE) return demoRetryFailed();

  return apiRequest<RetryFailedResponse>(
    `/batch/status/${token}/retry-failed`,
    { method: "POST" }
  );
}

export async function retrySingleFailed(
  token: string,
  itemId: string
): Promise<RetryFailedResponse> {
  if (IS_DEMO_MODE) return demoRetryFailed();

  return apiRequest<RetryFailedResponse>(
    `/batch/status/${token}/retry-failed/${itemId}`,
    { method: "POST" }
  );
}

// AI interviewer (recruiter side, batch-token flavor)

export async function getCandidateInterview(
  token: string,
  candidateId: string
): Promise<InterviewDetail | null> {
  if (IS_DEMO_MODE) return demoGetInterview();

  try {
    return await apiRequest<InterviewDetail>(
      `/batch/status/${token}/candidate/${candidateId}/interview`
    );
  } catch (err) {
    // 404 means "no interview yet", which the UI renders as the invite button.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function createCandidateInterview(
  token: string,
  candidateId: string
): Promise<InterviewSummary> {
  if (IS_DEMO_MODE) return demoCreateInterview();

  return apiRequest<InterviewSummary>(
    `/batch/status/${token}/candidate/${candidateId}/interview`,
    { method: "POST" }
  );
}

export async function reissueCandidateInterview(
  token: string,
  candidateId: string
): Promise<InterviewSummary> {
  if (IS_DEMO_MODE) return demoCreateInterview();

  return apiRequest<InterviewSummary>(
    `/batch/status/${token}/candidate/${candidateId}/interview/reissue`,
    { method: "POST" }
  );
}
