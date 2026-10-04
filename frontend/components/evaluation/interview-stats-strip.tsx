"use client";

import {
  CheckCircle,
  CircleDashed,
  ClipboardCheck,
  Inbox,
  Send,
} from "lucide-react";

import { countOrDash, StatCell, StatStrip } from "@/components/stat-strip";

/**
 * The Interviews tab's counterpart to StatsSummary — same StatStrip treatment
 * so the two tabs read as one page, but walking the interview funnel rather
 * than resume scores.
 *
 * The two cells that wait on the recruiter (a draft to review, an answered
 * interview to assess) turn amber when non-zero; the rest wait on the
 * candidate or are done, so they stay neutral.
 */
export function InterviewStatsStrip({
  notSent,
  needsReview,
  withCandidate,
  readyToAssess,
  assessed,
}: {
  notSent: number;
  needsReview: number;
  withCandidate: number;
  readyToAssess: number;
  assessed: number;
}) {
  return (
    <StatStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      <StatCell
        icon={CircleDashed}
        label="Not sent"
        value={countOrDash(notSent)}
        loading={false}
      />
      <StatCell
        icon={ClipboardCheck}
        label="Needs review"
        value={countOrDash(needsReview)}
        tone={needsReview > 0 ? "attention" : undefined}
        tooltip="Questions generated, waiting for you to review and send"
        loading={false}
      />
      <StatCell
        icon={Send}
        label="With candidate"
        value={countOrDash(withCandidate)}
        tooltip="Link created, or the candidate is mid-interview"
        loading={false}
      />
      <StatCell
        icon={Inbox}
        label="Ready to assess"
        value={countOrDash(readyToAssess)}
        tone={readyToAssess > 0 ? "attention" : undefined}
        tooltip="Candidate has answered, waiting for you to run the assessment"
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
