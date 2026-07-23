"use client";

import { Loader2, RefreshCw } from "lucide-react";

import { Card } from "@/components/ui/card";

export function ProcessingProgress({
  processed,
  total,
  failed,
  percent,
}: {
  processed: number;
  total: number;
  failed: number;
  percent: number;
}) {
  return (
    <Card className="p-8 shadow-xl border-border rounded-3xl bg-card mb-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 text-sm font-black text-foreground uppercase tracking-widest">
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Analyzing Resumes
          </span>
          <span className="tabular-nums">{percent}%</span>
        </div>
        <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden border border-border/50">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500 rounded-full shadow-[0_0_10px_theme(colors.primary/30%)]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pt-0.5">
          <span>
            {processed} of {total} candidates completed
            {failed > 0 && (
              <span className="text-error-foreground ml-1">({failed} failed)</span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Auto-refreshing every 10s
          </span>
        </div>
      </div>
    </Card>
  );
}
