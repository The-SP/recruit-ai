"use client";

import { Check, Loader2, Mail } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Email the invite link to the candidate.
 *
 * The address is prefilled from the resume but always editable, and nothing
 * is sent until the recruiter clicks: the parsed address can be wrong, and
 * the link alone grants access to the interview. Service-free like the rest
 * of the interview components; the page binds `onSend` and refetches so
 * `sentTo` / `sentAt` come back from the server.
 *
 * `primary` makes Send the page's main action (the approval screen). Dense
 * panels pass false so it sits beside Copy as an equal.
 */
export function SendInviteForm({
  defaultEmail,
  sentTo,
  sentAt,
  onSend,
  primary = false,
  size = "default",
}: {
  defaultEmail: string | null;
  sentTo: string | null;
  sentAt: string | null;
  onSend: (email: string) => Promise<void>;
  primary?: boolean;
  size?: "default" | "sm";
}) {
  const [email, setEmail] = useState(sentTo ?? defaultEmail ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sm = size === "sm";

  const trimmed = email.trim();
  // Sending the same address again is a resend; a new address is a fresh send.
  const isResend = sentTo !== null && trimmed === sentTo;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invite.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="candidate@example.com"
          aria-label="Candidate email"
          className={cn("flex-1", sm ? "h-8 text-xs" : "h-10")}
        />
        <Button
          type="submit"
          size={sm ? "sm" : "default"}
          variant={primary ? "default" : "outline"}
          disabled={!trimmed || sending}
          className={cn(
            "gap-1.5 shrink-0 font-semibold cursor-pointer",
            !sm && "h-10"
          )}
        >
          {sending ? (
            <Loader2 className={cn("animate-spin", sm ? "w-3.5 h-3.5" : "w-4 h-4")} />
          ) : (
            <Mail className={sm ? "w-3.5 h-3.5" : "w-4 h-4"} />
          )}
          {sending ? "Sending..." : isResend ? "Resend" : "Send invite"}
        </Button>
      </div>

      {error ? (
        <ErrorBanner size="sm">{error}</ErrorBanner>
      ) : (
        sentTo &&
        sentAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-success-foreground" />
            Sent to {sentTo} on{" "}
            {new Date(sentAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )
      )}
    </form>
  );
}
