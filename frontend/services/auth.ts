import { IS_DEMO_MODE } from "@/lib/demo";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "recruit_ai_token";

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
