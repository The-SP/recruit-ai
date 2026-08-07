"use client";

import type { LucideIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * One card in a stats strip. Shared by StatsSummary (screening) and
 * InterviewStatsStrip (interviews) so the two tabs can't drift apart on the
 * card treatment — they differ only in icon, label and value.
 */
export function StatTile({
  icon: Icon,
  iconClassName,
  label,
  children,
  tooltip,
}: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  children: React.ReactNode;
  tooltip?: string;
}) {
  const card = (
    <div
      className={
        "bg-card border border-border p-5 rounded-2xl shadow-sm" +
        (tooltip ? " cursor-default" : "")
      }
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-2 text-xs font-semibold">
        <Icon className={`w-3.5 h-3.5 ${iconClassName}`} />
        {label}
      </div>
      <div className="text-3xl font-black text-foreground">{children}</div>
    </div>
  );

  if (!tooltip) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Counts read better as an em dash than a zero in these strips. */
export function countOrDash(value: number): string | number {
  return value > 0 ? value : "—";
}
