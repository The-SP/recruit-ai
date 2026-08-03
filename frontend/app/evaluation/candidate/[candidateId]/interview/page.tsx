"use client";

import { useSearchParams } from "next/navigation";
import React, { use, useCallback, useEffect, useState } from "react";

import { RecruiterInterviewView } from "@/components/interview/recruiter-interview-view";
import { Card } from "@/components/ui/card";
import type { InterviewDetail } from "@/lib/interview-types";
import {
  type CandidateBreakdown,
  getCandidateBreakdown,
  getCandidateInterview,
  reissueCandidateInterview,
} from "@/services/batch";

function BatchCandidateInterviewPageInner({
  candidateId,
}: {
  candidateId: string;
}) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [interview, setInterview] = useState<InterviewDetail | "loading" | "error" | null>(
    "loading"
  );
  const [breakdown, setBreakdown] = useState<CandidateBreakdown | null>(null);

  const fetchInterview = useCallback(async () => {
    if (!token) return;
    setInterview("loading");
    try {
      const detail = await getCandidateInterview(token, candidateId);
      setInterview(detail);
    } catch {
      setInterview("error");
    }
  }, [token, candidateId]);

  useEffect(() => {
    // Legitimate fetch-on-mount/param-change; not a derived-state sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInterview();
  }, [fetchInterview]);

  useEffect(() => {
    if (!token) return;
    getCandidateBreakdown(token, candidateId)
      .then(setBreakdown)
      .catch(() => {});
  }, [token, candidateId]);

  if (!token) {
    return (
      <main className="px-6 py-12 max-w-3xl mx-auto">
        <Card className="p-8 text-center">
          <p className="font-semibold text-foreground">
            This link is missing its access token.
          </p>
        </Card>
      </main>
    );
  }

  const handleReissue = async () => {
    await reissueCandidateInterview(token, candidateId);
    await fetchInterview();
  };

  return (
    <RecruiterInterviewView
      backHref={`/evaluation?token=${token}`}
      candidateName={breakdown?.candidate_name ?? null}
      resumeFilename={breakdown?.filename ?? null}
      resumeMarkdown={breakdown?.resume_markdown ?? null}
      interview={interview}
      onReissue={handleReissue}
    />
  );
}

export default function BatchCandidateInterviewPage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = use(params);
  return (
    <React.Suspense>
      <BatchCandidateInterviewPageInner candidateId={candidateId} />
    </React.Suspense>
  );
}
