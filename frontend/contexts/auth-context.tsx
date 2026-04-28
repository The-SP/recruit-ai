"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { clearToken, getMe, UserResponse } from "@/services/auth";

interface AuthContextValue {
  user: UserResponse | null;
  isLoading: boolean;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const me = await getMe();
    setUser(me);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMe().then((me) => {
      if (!cancelled) {
        setUser(me);
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
