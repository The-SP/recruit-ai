"use client";

import { useState } from "react";

import { DemoModeError } from "@/lib/demo";
import { ApiError } from "@/services/api";

/**
 * Shared state for the recruiter invite affordances (generate / reissue /
 * copy link), used by both surfaces that manage an invite: the inline
 * InterviewSection and the dedicated RecruiterInterviewView.
 *
 * Keeps one copy of the DemoModeError-vs-ApiError mapping so a demo-mode
 * action renders an informational notice on both surfaces, not an error.
 */
export function useInviteActions() {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runAction = async (action: () => Promise<void>) => {
    setIsWorking(true);
    setError(null);
    setDemoNotice(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof DemoModeError) {
        setDemoNotice(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setIsWorking(false);
    }
  };

  const copyInviteUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (http origin); the URL stays selectable text.
    }
  };

  return { isWorking, error, demoNotice, copied, runAction, copyInviteUrl };
}
