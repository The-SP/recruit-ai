"use client";

import { CheckCircle, MessageSquareText, Send, Users } from "lucide-react";

import { countOrDash, StatTile } from "@/components/evaluation/stat-tile";

/**
 * The Interviews tab's counterpart to StatsSummary — same StatTile treatment so
 * the two tabs read as one page, but counting the interview funnel rather
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <StatTile icon={Users} iconClassName="text-primary" label="Total">
        {total}
      </StatTile>
      <StatTile
        icon={MessageSquareText}
        iconClassName="text-blue-500"
        label="Invited"
      >
        {countOrDash(invited)}
      </StatTile>
      <StatTile
        icon={Send}
        iconClassName="text-amber-500"
        label="Awaiting"
        tooltip="Invite sent, candidate hasn't started yet"
      >
        {countOrDash(awaiting)}
      </StatTile>
      <StatTile
        icon={CheckCircle}
        iconClassName="text-emerald-500"
        label="Assessed"
      >
        {countOrDash(assessed)}
      </StatTile>
    </div>
  );
}
