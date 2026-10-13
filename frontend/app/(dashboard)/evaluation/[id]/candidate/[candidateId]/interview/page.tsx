"use client";

import { use, useCallback, useEffect, useState } from "react";

import { RecruiterInterviewView } from "@/components/interview/recruiter-interview-view";
import type { InterviewDetail } from "@/lib/interview-types";
import type { CandidateBreakdown } from "@/services/batch";
import {
  assessRunCandidateInterview,
  fetchCandidateResume,
  fetchInterviewQuestionAudio,
  fetchInterviewTurnAudio,
  getRunCandidateBreakdown,
  getRunCandidateInterview,
  reissueRunCandidateInterview,
  sendRunCandidateInterviewInvite,
} from "@/services/runs";
import { useBreadcrumbLabel } from "@/components/dashboard-breadcrumbs";

export default function RunCandidateInterviewPage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id: runId, candidateId } = use(params);

  const [interview, setInterview] = useState<InterviewDetail | "loading" | "error" | null>(
    "loading"
  );
  const [breakdown, setBreakdown] = useState<CandidateBreakdown | null>(null);
  useBreadcrumbLabel(candidateId, breakdown?.candidate_name ?? breakdown?.filename);

  const fetchInterview = useCallback(async () => {
    setInterview("loading");
    try {
      const detail = await getRunCandidateInterview(runId, candidateId);
      setInterview(detail);
    } catch {
      setInterview("error");
    }
  }, [runId, candidateId]);

  useEffect(() => {
    // Legitimate fetch-on-mount/param-change; not a derived-state sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInterview();
  }, [fetchInterview]);

  useEffect(() => {
    getRunCandidateBreakdown(runId, candidateId)
      .then(setBreakdown)
      .catch(() => {});
  }, [runId, candidateId]);

  const handleReissue = async () => {
    await reissueRunCandidateInterview(runId, candidateId);
    await fetchInterview();
  };

  // Refetches quietly rather than through fetchInterview, whose "loading"
  // state would swap the page for a skeleton just to update one line.
  const handleSendInvite = async (email: string) => {
    await sendRunCandidateInterviewInvite(runId, candidateId, email);
    const detail = await getRunCandidateInterview(runId, candidateId);
    setInterview(detail);
  };

  const handleAssess = async () => {
    await assessRunCandidateInterview(runId, candidateId);
    await fetchInterview();
  };

  const handleFetchResume = useCallback(
    (id: string) => fetchCandidateResume(runId, id),
    [runId]
  );

  const handleFetchTurnAudio = useCallback(
    (seq: number) => fetchInterviewTurnAudio(runId, candidateId, seq),
    [runId, candidateId]
  );

  const handleFetchQuestionAudio = useCallback(
    (key: string) => fetchInterviewQuestionAudio(runId, candidateId, key),
    [runId, candidateId]
  );

  return (
    <RecruiterInterviewView
      candidateId={candidateId}
      candidateName={breakdown?.candidate_name ?? null}
      resumeFilename={breakdown?.filename ?? null}
      resumeMarkdown={breakdown?.resume_markdown ?? null}
      interview={interview}
      onReissue={handleReissue}
      onAssess={handleAssess}
      onSendInvite={handleSendInvite}
      onFetchTurnAudio={handleFetchTurnAudio}
      onFetchQuestionAudio={handleFetchQuestionAudio}
      onFetchResume={handleFetchResume}
    />
  );
}
