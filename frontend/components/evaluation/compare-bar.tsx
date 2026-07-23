"use client";

import { Columns2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EvaluationItem } from "@/lib/evaluation-types";

export function CompareBar({
  candidates,
  getKey,
  onRemove,
  onClear,
  onOpen,
}: {
  candidates: EvaluationItem[];
  // React key for each chip (candidate_id on the public page, item_id on the
  // dashboard). onRemove always receives the candidate_id.
  getKey: (item: EvaluationItem) => string;
  onRemove: (candidateId: string) => void;
  onClear: () => void;
  onOpen: () => void;
}) {
  if (candidates.length === 0) return null;

  return (
    <div className="sticky bottom-6 z-40 mx-auto mt-8 w-full max-w-3xl">
      <div className="bg-card border border-border rounded-2xl shadow-xl px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
          Compare
        </span>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {candidates.map(c => (
            <span
              key={getKey(c)}
              className="inline-flex items-center gap-1 bg-muted text-foreground text-xs font-medium rounded-lg pl-2.5 pr-1 py-1 max-w-44"
            >
              <span className="truncate">{c.candidate_name ?? c.filename}</span>
              <button
                onClick={() => onRemove(c.candidate_id!)}
                className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors cursor-pointer"
                title="Remove from comparison"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            onClick={onClear}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2"
          >
            Clear
          </button>
          <Button
            size="sm"
            onClick={onOpen}
            disabled={candidates.length < 2}
            className="h-9 px-4 font-bold rounded-xl gap-2 cursor-pointer"
            title={candidates.length < 2 ? "Select at least 2 candidates to compare" : undefined}
          >
            <Columns2 className="w-4 h-4" />
            Compare ({candidates.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
