"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function JobDescriptionSheet({
  open,
  onOpenChange,
  title,
  companyName,
  markdown,
  loading,
  error,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string | null;
  companyName: string | null;
  markdown: string | null;
  loading: boolean;
  error: string | null;
  onCopy: () => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await onCopy();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[480px] sm:w-[640px] sm:max-w-none flex flex-col p-0"
      >
        <SheetHeader className="px-6 py-5 border-b border-border shrink-0 pr-14">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="text-base font-bold leading-tight">
                {title || "Job Description"}
              </SheetTitle>
              <SheetDescription>
                {companyName || "Original role requirements"}
              </SheetDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!markdown}
              className="gap-2 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading job description...
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : markdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No job description available.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
