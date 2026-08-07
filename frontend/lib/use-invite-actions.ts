"use client";

import { useCallback, useState } from "react";

import { DemoModeError } from "@/lib/demo";
import { ApiError } from "@/services/api";

/**
 * Shared state for the recruiter invite affordances (generate / reissue /
 * copy link), used by every surface that manages an invite: the inline
 * InterviewSection, the RecruiterInterviewView, and the Interviews tab.
 *
 * Keeps one copy of the DemoModeError-vs-ApiError mapping so a demo-mode
 * action renders an informational notice on all of them, not an error.
 *
 * Actions are keyed. A single-invite panel passes no key and reads the
 * `isWorking` / `copied` booleans; a table passes the row id and reads
 * `busyKey` / `copiedKey`, because the booleans would disable every row's
 * button at once and flash "Copied" on all of them. The key is one id rather
 * than a Set on purpose: each action spends an LLM call (generation takes
 * ~20s), so they run one at a time either way.
 */

/** Stands in for the key of a keyless caller, so one state slot serves both
 *  shapes. Not a valid row id, so it can never collide with one. */
const SINGLETON_KEY = "__single__";

export function useInviteActions() {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  // Memoized so keyed callers can pass these through useCallback-wrapped row
  // handlers without every render handing the table new function identities.
  const runAction = useCallback(
    async (action: () => Promise<void>, key: string = SINGLETON_KEY) => {
      setBusyKey(key);
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
        setBusyKey(null);
      }
    },
    []
  );

  const copyInviteUrl = useCallback(
    async (url: string, key: string = SINGLETON_KEY) => {
      try {
        await navigator.clipboard.writeText(url);
        setCopiedKey(key);
        setTimeout(
          () => setCopiedKey((prev) => (prev === key ? null : prev)),
          2000
        );
      } catch {
        // Clipboard unavailable (http origin); the URL stays selectable text.
      }
    },
    []
  );

  return {
    busyKey,
    copiedKey,
    isWorking: busyKey !== null,
    copied: copiedKey !== null,
    error,
    demoNotice,
    runAction,
    copyInviteUrl,
  };
}
