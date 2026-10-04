"use client";

import type { ReactNode } from "react";

import { InterviewTranscript } from "@/components/interview/transcript";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { InterviewTurnData } from "@/lib/interview-types";

/**
 * The full transcript as a side panel, the counterpart of ResumeSheet. Used
 * once an interview is assessed: each finding already carries its own
 * exchange, so the whole transcript is reference material, not the page.
 * Closing the sheet unmounts its players, which stops any clip playing.
 */
export function TranscriptSheet({
  open,
  onClose,
  candidateName,
  turns,
  onFetchTurnAudio,
  renderQuestionAudio,
}: {
  open: boolean;
  onClose: () => void;
  candidateName: string;
  turns: InterviewTurnData[];
  onFetchTurnAudio?: (seq: number) => Promise<Blob>;
  renderQuestionAudio?: (turn: InterviewTurnData) => ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[540px] sm:max-w-none flex flex-col p-0">
        <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
          <SheetTitle className="text-base font-bold leading-tight">Transcript</SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {candidateName} · {turns.length} turns
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <InterviewTranscript
            turns={turns}
            autoScroll={false}
            variant="review"
            onFetchTurnAudio={onFetchTurnAudio}
            renderQuestionAudio={renderQuestionAudio}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
