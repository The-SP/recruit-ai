"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AttentionItem, AttentionKind } from "@/services/runs";

// Runs beyond this collapse behind "Show all", so a busy account doesn't push
// the recent-runs table below the fold on narrow screens.
const VISIBLE_RUNS = 4;

// Order is severity: broken first, then waiting on the recruiter. It sorts
// both the chips within a run and the runs themselves (by their worst chip).
const kindOrder: AttentionKind[] = [
  "run_failed",
  "resumes_failed",
  "assessment_failed",
  "awaiting_approval",
  "expired",
];

type Severity = "error" | "warning";

const kindMeta: Record<
  AttentionKind,
  { severity: Severity; label: (count: number) => string }
> = {
  run_failed: {
    severity: "error",
    label: () => "Evaluation failed",
  },
  resumes_failed: {
    severity: "error",
    label: (n) => (n === 1 ? "1 resume failed" : `${n} resumes failed`),
  },
  assessment_failed: {
    severity: "error",
    label: (n) =>
      n === 1 ? "1 assessment failed" : `${n} assessments failed`,
  },
  awaiting_approval: {
    severity: "warning",
    label: (n) => `${n} awaiting approval`,
  },
  expired: {
    severity: "warning",
    label: (n) => (n === 1 ? "1 invite expired" : `${n} invites expired`),
  },
};

const dotClass: Record<Severity, string> = {
  error: "bg-destructive",
  warning: "bg-amber-500",
};

interface RunGroup {
  runId: string;
  jobTitle: string | null;
  companyName: string | null;
  items: AttentionItem[];
}

function groupByRun(items: AttentionItem[]): RunGroup[] {
  const groups = new Map<string, RunGroup>();
  for (const item of items) {
    const group = groups.get(item.run_id) ?? {
      runId: item.run_id,
      jobTitle: item.job_title,
      companyName: item.company_name,
      items: [],
    };
    group.items.push(item);
    groups.set(item.run_id, group);
  }
  const rank = (kind: AttentionKind) => kindOrder.indexOf(kind);
  const worst = (group: RunGroup) => rank(group.items[0].kind);
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => rank(a.kind) - rank(b.kind)),
    }))
    .sort((a, b) => worst(a) - worst(b));
}

export function DashboardAttention({ items }: { items: AttentionItem[] }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const groups = groupByRun(items);
  const visible = expanded ? groups : groups.slice(0, VISIBLE_RUNS);
  const hidden = groups.length - VISIBLE_RUNS;

  return (
    <div>
      {/* min-h matches the "Recent evaluations" header row beside it in the
          two-column layout, so both headings sit on one baseline. */}
      <div className="flex items-center gap-2 min-h-8 mb-4">
        <Bell className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Needs attention</h2>
        <Badge
          variant="outline"
          className="tabular-nums bg-muted text-muted-foreground border-transparent"
        >
          {groups.length}
        </Badge>
      </div>
      <Card className="py-0 gap-0 divide-y divide-foreground/10 overflow-hidden">
        {visible.map((group) => (
          <Link
            key={group.runId}
            href={`/evaluation/${group.runId}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-foreground/[0.04] transition-colors"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-sm font-medium truncate">
                {group.jobTitle ?? "Untitled"}
                {group.companyName && (
                  <span className="text-muted-foreground font-normal">
                    {` · ${group.companyName}`}
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((item) => {
                  const meta = kindMeta[item.kind];
                  return (
                    <span
                      key={item.kind}
                      className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-2 py-0.5 text-xs text-foreground/80"
                    >
                      <span
                        className={`size-1.5 rounded-full ${dotClass[meta.severity]}`}
                      />
                      {meta.label(item.count)}
                    </span>
                  );
                })}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            {expanded ? "Show less" : `Show all (${groups.length})`}
          </button>
        )}
      </Card>
    </div>
  );
}
