"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DemoBanner } from "@/components/demo-banner";
import { IS_DEMO_MODE } from "@/lib/demo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LoginPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [isDemoDialogOpen, setIsDemoDialogOpen] = useState(false);

  // In demo mode sign-in stays visible to show the feature exists, but the
  // OAuth redirect would leave the site for a backend that is powered down.
  const handleSignIn = () => {
    if (IS_DEMO_MODE) {
      setIsDemoDialogOpen(true);
      return;
    }
    window.location.href = `${API_URL}/auth/google`;
  };

  useEffect(() => {
    if (!isLoading && user) router.replace("/");
  }, [isLoading, user, router]);

  if (isLoading) return null;

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <div className="flex justify-center">
            <div className="bg-primary p-3 rounded-2xl">
              <Briefcase className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">Welcome to Recruit AI</h1>
          <p className="text-muted-foreground">
            Sign in to access your evaluation history and results.
          </p>
        </div>

        <Button
          className="w-full gap-3"
          size="lg"
          onClick={handleSignIn}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </Button>

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
      </div>
    </main>
  );
}
