"use client";

import { Columns2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MAX_COMPARE, type EvaluationItem } from "@/lib/evaluation-types";

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
  const canCompare = candidates.length >= 2;

  return (
    // Full width of the page column, so it lines up with the table above.
    <div className="sticky bottom-6 z-40 mt-8 w-full">
      <div className="bg-card border border-border rounded-2xl shadow-xl px-4 py-3 flex flex-wrap items-center gap-2">
        {/* The count carries the limit up front, rather than leaving it to a
            greyed-out checkbox. With one pick it says what's missing instead,
            visible on touch and to keyboard users, unlike a title tooltip. */}
        <span className="text-sm text-muted-foreground shrink-0 mr-1 tabular-nums">
          {canCompare
            ? `${candidates.length} of ${MAX_COMPARE} selected`
            : "Select one more to compare"}
        </span>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {candidates.map(c => (
            <span
              key={getKey(c)}
              className="inline-flex items-center gap-1 bg-muted text-foreground text-xs font-medium rounded-lg pl-2.5 pr-1 py-1 max-w-44"
            >
              <span className="truncate">{c.candidate_name ?? c.filename}</span>
              <button
                type="button"
                onClick={() => onRemove(c.candidate_id!)}
                className="p-1 -my-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors cursor-pointer"
                aria-label={`Remove ${c.candidate_name ?? c.filename} from comparison`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2"
          >
            Clear selection
          </button>
          <Button
            size="sm"
            onClick={onOpen}
            disabled={!canCompare}
            className="h-9 px-4 font-bold rounded-xl gap-2 cursor-pointer"
          >
            <Columns2 className="w-4 h-4" />
            Compare
          </Button>
        </div>
      </div>
    </div>
  );
}
