"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Briefcase, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DemoBanner } from "@/components/demo-banner";
import { GoogleIcon } from "@/components/google-icon";
import { IS_DEMO_MODE } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { rememberNextPath, safeNextPath } from "@/services/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Set by the backend OAuth callback (and the frontend callback when no token
// arrives). Cancelling is the user's choice, so it reads as amber, not red.
const SIGN_IN_ERRORS: Record<string, { message: string; tone: "warning" | "error" }> = {
  cancelled: {
    message: "Sign-in was cancelled. Try again whenever you're ready.",
    tone: "warning",
  },
  failed: {
    message: "We couldn't sign you in with Google. Please try again.",
    tone: "error",
  },
};

interface LoginCardProps {
  next: string | null;
  error: string | null;
}

export function LoginCard({ next, error }: LoginCardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [isDemoDialogOpen, setIsDemoDialogOpen] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const signInError = error ? SIGN_IN_ERRORS[error] : undefined;

  // Coming back from Google with the browser's back button restores this page
  // from the bfcache with the spinner still showing; reset it.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setIsRedirecting(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (!isLoading && user) router.replace(safeNextPath(next) ?? "/dashboard");
  }, [isLoading, user, router, next]);

  // In demo mode sign-in stays visible to show the feature exists, but the
  // OAuth redirect would leave the site for a backend that is powered down.
  const handleSignIn = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (IS_DEMO_MODE) {
      e.preventDefault();
      setIsDemoDialogOpen(true);
      return;
    }
    if (isLoading || isRedirecting) {
      e.preventDefault();
      return;
    }
    rememberNextPath(next);
    setIsRedirecting(true);
  };

  const isDisabled = isLoading || isRedirecting;

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md gap-8 px-6 py-10 sm:px-10 sm:py-12 text-center">
        <div className="space-y-3">
          <div className="flex justify-center pb-2">
            <div className="bg-primary p-3 rounded-2xl">
              <Briefcase className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">Welcome to Recruit AI</h1>
          <p className="text-base text-muted-foreground">
            Sign in to screen resumes, interview candidates, and keep every run
            in one place.
          </p>
        </div>

        {signInError && (
          <div
            role="alert"
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm",
              signInError.tone === "warning"
                ? "border-warning-edge bg-warning text-warning-foreground"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{signInError.message}</span>
          </div>
        )}

        <div className="space-y-3">
          <Button
            variant="outline"
            size="lg"
            className={cn("w-full h-12 gap-3 text-base", isDisabled && "pointer-events-none opacity-60")}
            asChild
          >
            <a
              href={`${API_URL}/auth/google`}
              onClick={handleSignIn}
              aria-disabled={isDisabled}
            >
              {isRedirecting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <GoogleIcon className="w-5 h-5" />
              )}
              {isRedirecting ? "Redirecting to Google…" : "Sign in with Google"}
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">
            We only use your name, email and photo from Google.
          </p>
        </div>

        <Dialog open={isDemoDialogOpen} onOpenChange={setIsDemoDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            {/* The banner carries the visible heading and copy; these keep the
                dialog accessible without repeating that text on screen. */}
            <DialogTitle className="sr-only">Demo mode</DialogTitle>
            <DialogDescription className="sr-only">
              Sign-in is unavailable in this demo because the backend is powered
              down.
            </DialogDescription>
            <DemoBanner variant="login" bare className="text-left" />
          </DialogContent>
        </Dialog>
      </Card>
    </main>
  );
}
