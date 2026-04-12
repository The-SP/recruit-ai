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

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, headers = {}, ...rest } = options;
  const authHeaders: Record<string, string> = API_KEY ? { "X-API-Key": API_KEY } : {};

  const config: RequestInit = { ...rest };

  if (body !== undefined) {
    if (body instanceof FormData) {
      config.body = body;
      config.headers = { ...authHeaders, ...headers };
    } else {
      config.body = JSON.stringify(body);
      config.headers = { "Content-Type": "application/json", ...authHeaders, ...headers };
    }
  } else {
    config.headers = { ...authHeaders, ...headers };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, config);
  } catch {
    throw new ApiError("Network error. Please check your connection.", 0);
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (data.detail) {
        message = typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail);
      }
    } catch {
      // Response body is not JSON, use default message
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}
