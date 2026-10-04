import { IS_DEMO_MODE } from "@/lib/demo";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "recruit_ai_token";
const NEXT_PATH_KEY = "recruit_ai_next_path";
const DEFAULT_NEXT_PATH = "/dashboard";

export interface UserResponse {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Only same-origin app paths: "//evil.com" and "/\\evil.com" are
// protocol-relative URLs, and bouncing back into the auth pages would loop.
export function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return null;
  }
  if (raw.startsWith("/login") || raw.startsWith("/auth")) return null;
  return raw;
}

// The OAuth round trip leaves the site, so the page to return to rides in
// sessionStorage between the login page and the callback.
export function rememberNextPath(raw: string | null): void {
  const path = safeNextPath(raw);
  try {
    if (path) sessionStorage.setItem(NEXT_PATH_KEY, path);
    else sessionStorage.removeItem(NEXT_PATH_KEY);
  } catch {
    // Storage blocked: sign-in still works, it just lands on the default.
  }
}

export function takeNextPath(): string {
  try {
    const path = safeNextPath(sessionStorage.getItem(NEXT_PATH_KEY));
    sessionStorage.removeItem(NEXT_PATH_KEY);
    return path ?? DEFAULT_NEXT_PATH;
  } catch {
    return DEFAULT_NEXT_PATH;
  }
}

export async function getMe(): Promise<UserResponse | null> {
  // The demo has no backend to authenticate against, so skip the request
  // rather than fail it on every page load. Returning null leaves the app in
  // its logged-out state, which is what the demo shows.
  if (IS_DEMO_MODE) return null;

  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) clearToken();
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}
