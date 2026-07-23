"use client";

import ReactMarkdown from "react-markdown";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ResumePanelState } from "@/lib/evaluation-types";

export function ResumeSheet({
  panel,
  onClose,
}: {
  panel: ResumePanelState | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={panel !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[480px] sm:w-[540px] sm:max-w-none flex flex-col p-0">
        <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
          <SheetTitle className="text-base font-bold leading-tight">
            {panel?.name ?? panel?.filename}
          </SheetTitle>
          {panel?.name && (
            <p className="text-xs text-muted-foreground mt-0.5">{panel.filename}</p>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {panel?.markdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
              <ReactMarkdown>{panel.markdown}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No resume content available.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
