"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "@/services/auth";
import { useAuth } from "@/contexts/auth-context";

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setToken(token);
      refresh().then(() => router.replace("/"));
    } else {
      router.replace("/login");
    }
  }, [searchParams, router, refresh]);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm">Signing you in…</p>
      </div>
    </main>
  );
}
