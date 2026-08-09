import { getToken } from "@/services/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export const apiUrl = (endpoint: string) => `${BASE_URL}${endpoint}`;

/** The API key + JWT headers every request carries. Exported for callers that
 * must fetch by hand (streaming responses) and can't go through apiRequest. */
export function authHeaders(): Record<string, string> {
  const jwtToken = getToken();
  return {
    ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
    ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
  };
}

/** Best-effort `detail` extraction from a failed response body, matching the
 * message apiRequest would have thrown. Consumes the body. */
export async function errorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data.detail) {
      return typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail);
    }
  } catch {
    // Response body is not JSON, use default message
  }
  return `Request failed with status ${res.status}`;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, headers = {}, ...rest } = options;
  const auth = authHeaders();

  const config: RequestInit = { ...rest };

  if (body !== undefined) {
    if (body instanceof FormData) {
      config.body = body;
      config.headers = { ...auth, ...headers };
    } else {
      config.body = JSON.stringify(body);
      config.headers = { "Content-Type": "application/json", ...auth, ...headers };
    }
  } else {
    config.headers = { ...auth, ...headers };
  }

  const res = await apiFetch(endpoint, config);

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

/**
 * The request envelope without the JSON parse: fetch, turn a transport failure
 * into ApiError(0), turn a non-2xx into ApiError(status).
 *
 * For responses apiRequest can't finish — streams (SSE) and binary bodies —
 * so those callers don't each re-implement the error mapping. Headers are
 * passed through as given: callers that need auth pass authHeaders(), and a
 * FormData body must NOT carry a Content-Type or the multipart boundary is lost.
 */
export async function apiFetch(
  endpoint: string,
  init: RequestInit = {}
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(apiUrl(endpoint), init);
  } catch {
    throw new ApiError("Network error. Please check your connection.", 0);
  }

  if (!res.ok) {
    throw new ApiError(await errorMessage(res), res.status);
  }

  return res;
}
