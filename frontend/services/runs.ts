import type { InterviewDetail, InterviewSummary } from "@/lib/interview-types";

import { ApiError, apiRequest } from "./api";
import type { CandidateBreakdown } from "./batch";

export type RunStatus = "draft" | "pending" | "processing" | "completed" | "failed";

export interface RunItemSummary {
  item_id: string;
  candidate_id: string | null;
  candidate_name: string | null;
  filename: string;
  final_score: number | null;
  hire_signal: string | null;
  status: string;
}

export interface EvaluationRunSummary {
  id: string;
  job_id: string;
  job_title: string | null;
  company_name: string | null;
  status: RunStatus;
  total_count: number;
  processed_count: number;
  failed_count: number;
  processing_time_seconds: number | null;
  created_at: string;
}

export interface EvaluationRunDetail extends EvaluationRunSummary {
  items: RunItemSummary[];
}

export interface EvaluationRunListResponse {
  items: EvaluationRunSummary[];
  total: number;
}

export interface DashboardStatsResponse {
  total_runs: number;
  total_candidates: number;
  last_active: string | null;
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

export async function createEvaluationRun(
  jobText: string,
  files: File[]
): Promise<EvaluationRunSummary> {
  const formData = new FormData();
  formData.append("job_text", jobText);
  files.forEach((file) => formData.append("files", file));
  return apiRequest<EvaluationRunSummary>("/evaluations/runs", {
    method: "POST",
    body: formData,
  });
}

export async function listEvaluationRuns(
  limit = 50,
  offset = 0
): Promise<EvaluationRunListResponse> {
  return apiRequest<EvaluationRunListResponse>(
    `/evaluations/runs?limit=${limit}&offset=${offset}`
  );
}

export async function getEvaluationRun(runId: string): Promise<EvaluationRunDetail> {
  return apiRequest<EvaluationRunDetail>(`/evaluations/runs/${runId}`);
}

export async function addCandidatesToRun(
  runId: string,
  files: File[]
): Promise<AddCandidatesResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return apiRequest<AddCandidatesResponse>(
    `/evaluations/runs/${runId}/add-candidates`,
    { method: "POST", body: formData }
  );
}

export async function retryFailedRun(runId: string): Promise<RetryFailedResponse> {
  return apiRequest<RetryFailedResponse>(
    `/evaluations/runs/${runId}/retry-failed`,
    { method: "POST" }
  );
}

export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  return apiRequest<DashboardStatsResponse>("/dashboard/stats");
}

export async function getRunCandidateBreakdown(
  runId: string,
  candidateId: string
): Promise<CandidateBreakdown> {
  return apiRequest<CandidateBreakdown>(
    `/evaluations/runs/${runId}/candidate/${candidateId}`
  );
}

// AI interviewer (recruiter side, owned-run flavor)

export async function getRunCandidateInterview(
  runId: string,
  candidateId: string
): Promise<InterviewDetail | null> {
  try {
    return await apiRequest<InterviewDetail>(
      `/evaluations/runs/${runId}/candidate/${candidateId}/interview`
    );
  } catch (err) {
    // 404 means "no interview yet", which the UI renders as the invite button.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function createRunCandidateInterview(
  runId: string,
  candidateId: string
): Promise<InterviewSummary> {
  return apiRequest<InterviewSummary>(
    `/evaluations/runs/${runId}/candidate/${candidateId}/interview`,
    { method: "POST" }
  );
}

export async function reissueRunCandidateInterview(
  runId: string,
  candidateId: string
): Promise<InterviewSummary> {
  return apiRequest<InterviewSummary>(
    `/evaluations/runs/${runId}/candidate/${candidateId}/interview/reissue`,
    { method: "POST" }
  );
}

export async function assessRunCandidateInterview(
  runId: string,
  candidateId: string
): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(
    `/evaluations/runs/${runId}/candidate/${candidateId}/interview/assess`,
    { method: "POST" }
  );
}
