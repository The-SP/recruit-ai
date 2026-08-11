"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";

/**
 * Bounces non-admins away from a typed /admin URL.
 *
 * This is convenience only — it stops a signed-in non-admin from staring at an
 * empty shell full of error cards. The real boundary is require_admin on the
 * backend, which answers every /admin/* request with 403. Do not add data
 * fetching here on the assumption this gate held.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const denied = !isLoading && user != null && !user.is_admin;

  useEffect(() => {
    if (denied) router.replace("/dashboard");
  }, [denied, router]);

  if (isLoading || !user || denied) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
