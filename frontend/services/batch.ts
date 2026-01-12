import { apiRequest } from "./api";

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
  candidate_id: string | null;
  candidate_name: string | null;
  filename: string;
  final_score: number | null;
  hire_signal: string | null;
  status: string;
}

// API functions
export async function submitBatch(
  jobText: string,
  email: string,
  files: File[]
): Promise<SubmitBatchResponse> {
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
  return apiRequest<BatchStatus>(`/batch/status/${token}`);
}
