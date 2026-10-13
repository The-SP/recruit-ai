"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Download, Loader2 } from "lucide-react";

import { PdfIcon } from "@/components/pdf-icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ResumePanelState } from "@/lib/evaluation-types";

type OriginalState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

export function ResumeSheet({
  panel,
  onClose,
  onFetchOriginal,
}: {
  panel: ResumePanelState | null;
  onClose: () => void;
  /** Bound by the page for the owned flow only. Without it the sheet shows the
   * parsed markdown alone: the anonymous surface never serves the PDF. */
  onFetchOriginal?: (candidateId: string) => Promise<Blob>;
}) {
  const candidateId = panel?.candidateId;
  const fetchOriginal =
    onFetchOriginal && candidateId ? () => onFetchOriginal(candidateId) : undefined;
  // Widened for the PDF, tied to the candidate it was widened for so a panel
  // swapped or cleared by the page never inherits it.
  const panelKey = panel ? `${candidateId}:${panel.filename}` : null;
  const [wideFor, setWideFor] = useState<string | null>(null);
  const wide = panelKey !== null && wideFor === panelKey;

  return (
    <Sheet open={panel !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        // Radix focuses the first focusable element on open, which is the PDF
        // toggle, and a focused tooltip trigger shows its tooltip. Focus the
        // panel itself instead so nothing pops until it's actually hovered.
        onOpenAutoFocus={e => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        className={cn(
          "flex flex-col p-0 sm:max-w-none",
          wide ? "w-full sm:w-[760px]" : "w-[480px] sm:w-[540px]"
        )}
      >
        {panel && (
          // Keyed so a different candidate starts back on the parsed view with
          // nothing loaded.
          <ResumeSheetBody
            key={panelKey}
            panel={panel}
            fetchOriginal={fetchOriginal}
            onShowPdfChange={show => setWideFor(show ? panelKey : null)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ResumeSheetBody({
  panel,
  fetchOriginal,
  onShowPdfChange,
}: {
  panel: ResumePanelState;
  fetchOriginal?: () => Promise<Blob>;
  onShowPdfChange: (show: boolean) => void;
}) {
  const [showPdf, setShowPdf] = useState(false);
  const [original, setOriginal] = useState<OriginalState>({ status: "idle" });

  // Fetched only when the PDF is viewed or downloaded, so browsing parsed
  // resumes never pulls PDFs from storage. Shared by both actions, so a click
  // on each while one load is in flight costs a single request; a failure
  // clears it so the next click retries.
  const inflight = useRef<Promise<string | null> | null>(null);
  const loadOriginal = (): Promise<string | null> => {
    if (original.status === "ready") return Promise.resolve(original.url);
    if (!fetchOriginal) return Promise.resolve(null);
    if (inflight.current) return inflight.current;

    setOriginal({ status: "loading" });
    inflight.current = fetchOriginal()
      .then(blob => {
        // Re-typed so the viewer renders it even if a proxy drops the header.
        const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setOriginal({ status: "ready", url });
        return url;
      })
      .catch((err: unknown) => {
        inflight.current = null;
        setOriginal({
          status: "error",
          message: err instanceof Error ? err.message : "Couldn't load the original PDF.",
        });
        return null;
      });
    return inflight.current;
  };

  const togglePdf = () => {
    const next = !showPdf;
    setShowPdf(next);
    onShowPdfChange(next);
    if (next) void loadOriginal();
  };

  const downloadPdf = async () => {
    const url = await loadOriginal();
    if (!url) return;
    // A detached anchor, so the file saves under its original name rather
    // than the blob URL's random one.
    const a = document.createElement("a");
    a.href = url;
    a.download = panel.filename;
    a.click();
  };

  // Object URLs pin the blob in memory until revoked; this runs when the
  // candidate changes (the key remounts) or the sheet closes.
  const readyUrl = original.status === "ready" ? original.url : null;
  useEffect(() => {
    if (!readyUrl) return;
    return () => URL.revokeObjectURL(readyUrl);
  }, [readyUrl]);

  return (
    <>
      {/* pr-14 keeps the actions clear of the sheet's absolute close button. */}
      <SheetHeader className="flex-row items-start justify-between gap-3 pl-6 pr-14 py-5 border-b border-border shrink-0">
        <div className="min-w-0">
          <SheetTitle className="text-base font-bold leading-tight">
            {panel.name ?? panel.filename}
          </SheetTitle>
          {panel.name && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{panel.filename}</p>
          )}
        </div>
        {fetchOriginal && (
          <div className="flex items-center gap-1 shrink-0 -my-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void downloadPdf()}
                  disabled={original.status === "loading"}
                  aria-label="Download PDF"
                  className="size-9 cursor-pointer"
                >
                  {original.status === "loading" && !showPdf ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download PDF</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={togglePdf}
                  aria-pressed={showPdf}
                  aria-label={showPdf ? "Show parsed resume" : "View original PDF"}
                  className={cn("size-9 cursor-pointer", showPdf && "bg-muted")}
                >
                  <PdfIcon className="size-7" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showPdf ? "Show parsed resume" : "View original PDF"}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </SheetHeader>

      {/* The PDF view shows its own error; this covers a download from the parsed view. */}
      {!showPdf && original.status === "error" && (
        <p className="px-6 pt-4 text-sm text-destructive">{original.message}</p>
      )}

      {showPdf ? (
        <div className="flex-1 min-h-0">
          {original.status === "ready" ? (
            <iframe
              src={original.url}
              title={`Original resume: ${panel.filename}`}
              className="w-full h-full border-0"
            />
          ) : original.status === "error" ? (
            <p className="px-6 py-5 text-sm text-destructive">{original.message}</p>
          ) : (
            <div className="flex items-center gap-2 px-6 py-5 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading original PDF…
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {panel.markdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
              <ReactMarkdown>{panel.markdown}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No resume content available.</p>
          )}
        </div>
      )}
    </>
  );
}
