import { getToken } from "@/services/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Seconds to wait before retrying, from a 429. The backend sends this in
     * the body as well as the Retry-After header because CORS hides response
     * headers by default. Undefined for every other status. */
    public retryAfter?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export const apiUrl = (endpoint: string) => `${BASE_URL}${endpoint}`;

/** The JWT header every request carries. Exported for callers that must fetch
 * by hand (streaming responses) and can't go through apiRequest. */
export function authHeaders(): Record<string, string> {
  const jwtToken = getToken();
  return {
    ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
  };
}

/** Best-effort `detail` + `retry_after` extraction from a failed response body,
 * matching the error apiRequest would have thrown. Consumes the body, so both
 * fields come out of a single read. */
export async function errorDetails(
  res: Response
): Promise<{ message: string; retryAfter?: number }> {
  let message = `Request failed with status ${res.status}`;
  let retryAfter: number | undefined;

  try {
    const data = await res.json();
    if (data.detail) {
      message =
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail);
    }
    if (typeof data.retry_after === "number") {
      retryAfter = data.retry_after;
    }
  } catch {
    // Response body is not JSON, use default message
  }

  if (retryAfter === undefined) {
    // Header fallback: only readable when the server exposes it via CORS.
    const header = Number(res.headers.get("Retry-After"));
    if (Number.isFinite(header) && header > 0) retryAfter = header;
  }

  return { message, retryAfter };
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
    const { message, retryAfter } = await errorDetails(res);
    throw new ApiError(message, res.status, retryAfter);
  }

  return res;
}
