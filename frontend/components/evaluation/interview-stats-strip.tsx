"use client";

import { CheckCircle, MessageSquareText, Send, Users } from "lucide-react";

import { countOrDash, StatCell, StatStrip } from "@/components/stat-strip";

/**
 * The Interviews tab's counterpart to StatsSummary — same StatStrip treatment
 * so the two tabs read as one page, but counting the interview funnel rather
 * than resume scores.
 */
export function InterviewStatsStrip({
  total,
  invited,
  awaiting,
  assessed,
}: {
  total: number;
  invited: number;
  awaiting: number;
  assessed: number;
}) {
  return (
    <StatStrip className="grid-cols-2 md:grid-cols-4">
      <StatCell icon={Users} label="Total" value={total} loading={false} />
      <StatCell
        icon={MessageSquareText}
        label="Invited"
        value={countOrDash(invited)}
        loading={false}
      />
      <StatCell
        icon={Send}
        label="Awaiting"
        value={countOrDash(awaiting)}
        tooltip="Invite sent, candidate hasn't started yet"
        loading={false}
      />
      <StatCell
        icon={CheckCircle}
        label="Assessed"
        value={countOrDash(assessed)}
        loading={false}
      />
    </StatStrip>
  );
}
