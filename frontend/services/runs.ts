import type { InterviewDetail, InterviewSummary } from "@/lib/interview-types";

import { ApiError, apiFetch, apiRequest, authHeaders } from "./api";
import type { CandidateBreakdown } from "./batch";

export type RunStatus = "draft" | "pending" | "processing" | "completed" | "failed";

/**
 * Row-level interview state, mirroring RunItemInterview in
 * backend/app/api/schemas/runs.py. Enough to render a table row and pick the
 * right action; the transcript, rubric and assessment body still come from
 * the per-candidate detail endpoint.
 *
 * `answered` separates an expired interview that can still be assessed from
 * one that can only be reissued; `has_assessment_error` separates a failed
 * assessment from one merely pending, since both sit at status "completed".
 */
export interface RunItemInterview {
  status: string;
  recommendation: string | null;
  answered: boolean;
  has_assessment_error: boolean;
  invite_url: string;
  expires_at: string;
  completed_at: string | null;
  assessed_at: string | null;
}

export interface RunItemSummary {
  item_id: string;
  candidate_id: string | null;
  candidate_name: string | null;
  filename: string;
  final_score: number | null;
  hire_signal: string | null;
  status: string;
  // null means no interview exists for this candidate yet. Deliberately not
  // on the shared EvaluationItem type: the anonymous flow can never have one.
  interview: RunItemInterview | null;
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

/**
 * Fetch the recording behind one answer turn.
 *
 * apiFetch rather than apiRequest, which ends in res.json(): the endpoint
 * returns audio bytes. It also can't be a bare <audio src>, because that
 * request would carry no Authorization header.
 */
export async function fetchInterviewTurnAudio(
  runId: string,
  candidateId: string,
  seq: number
): Promise<Blob> {
  const res = await apiFetch(
    `/evaluations/runs/${runId}/candidate/${candidateId}/interview/audio/${seq}`,
    { headers: authHeaders() }
  );
  return res.blob();
}
