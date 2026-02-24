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

// Candidate breakdown types (mirrors backend internal schemas)
export interface SkillGroupDetail {
  skill_options: string[];
  tier: "critical" | "required" | "preferred";
  match_type: "exact" | "equivalent" | "transferable" | "foundational" | "none";
  matched_by: string | null;
  evidence: string;
  reasoning: string;
}

export interface SkillBreakdown {
  llm_response: {
    evaluations: SkillGroupDetail[];
    strengths: string[];
    development_areas: string[];
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

export async function getCandidateBreakdown(
  token: string,
  candidateId: string
): Promise<CandidateBreakdown> {
  return apiRequest<CandidateBreakdown>(
    `/batch/status/${token}/candidate/${candidateId}`
  );
}

export async function getHistory(limit = 50): Promise<HistoryListResponse> {
  return apiRequest<HistoryListResponse>(`/batch/history?limit=${limit}`);
}
