import { apiRequest } from "./api";

/**
 * Read-only cross-tenant views, gated server-side by require_admin.
 *
 * There is no write counterpart on purpose: budget and circuit-breaker
 * controls stay on the backend Makefile (`make budget-status`,
 * `make circuit-reset`) rather than becoming buttons here.
 */

export interface AdminStatsResponse {
  total_users: number;
  new_users_7d: number;
  total_runs: number;
  runs_24h: number;
  runs_7d: number;
  runs_by_status: Record<string, number>;
  total_candidates: number;
  anonymous_runs: number;
  owned_runs: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  run_count: number;
  last_run_at: string | null;
}

export interface AdminUserListResponse {
  items: AdminUserRow[];
  total: number;
}

export interface AdminRunRow {
  id: string;
  created_at: string;
  status: string;
  job_title: string | null;
  company_name: string | null;
  total_count: number;
  processed_count: number;
  failed_count: number;
  processing_time_seconds: number | null;
  owner_email: string | null;
  contact_email: string | null;
}

export interface AdminRunListResponse {
  items: AdminRunRow[];
  total: number;
}

export async function getAdminStats(): Promise<AdminStatsResponse> {
  return apiRequest<AdminStatsResponse>("/admin/stats");
}

export async function listAllUsers(
  limit = 50,
  offset = 0,
  search?: string,
): Promise<AdminUserListResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search) params.set("search", search);
  return apiRequest<AdminUserListResponse>(`/admin/users?${params}`);
}

export async function listAllRuns(
  limit = 50,
  offset = 0,
  status?: string,
  search?: string,
): Promise<AdminRunListResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  return apiRequest<AdminRunListResponse>(`/admin/runs?${params}`);
}
