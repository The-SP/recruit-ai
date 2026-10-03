"use client";

import { use, useCallback, useEffect, useState } from "react";

import {
  ApprovedNotice,
  InterviewReviewView,
  type ScriptDraft,
} from "@/components/interview/interview-review-view";
import {
  MAX_QUESTIONS,
  toDraft,
  type TemplateDraft,
} from "@/components/interview/template-editor";
import type {
  FixedQuestionData,
  InterviewDetail,
  InterviewQuestionData,
  InterviewTemplateData,
} from "@/lib/interview-types";
import { useInviteActions } from "@/lib/use-invite-actions";
import type { CandidateBreakdown } from "@/services/batch";
import {
  approveRunCandidateInterview,
  createRunCandidateInterview,
  draftRunCandidateInterviewQuestion,
  getEvaluationRun,
  getInterviewTemplate,
  getRunCandidateBreakdown,
  getRunCandidateInterview,
  saveInterviewTemplate,
  updateRunCandidateInterviewDraft,
} from "@/services/runs";
import { useBreadcrumbLabel } from "@/components/dashboard-breadcrumbs";

function scriptFrom(interview: InterviewDetail): ScriptDraft {
  return {
    opening: interview.opening,
    questions: interview.questions,
    closing: interview.closing,
    followupsEnabled: interview.followups_enabled,
    timeLimitSeconds: interview.time_limit_seconds,
  };
}

export default function InterviewReviewPage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id: runId, candidateId } = use(params);

  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [breakdown, setBreakdown] = useState<CandidateBreakdown | null>(null);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  useBreadcrumbLabel(runId, jobTitle);
  useBreadcrumbLabel(candidateId, breakdown?.candidate_name ?? breakdown?.filename);
  const [interviewCount, setInterviewCount] = useState(0);
  // Both header fetches, tracked as one flag. They settle independently but
  // fill the same two lines, so flipping them separately would just make the
  // header rearrange twice.
  const [runLoading, setRunLoading] = useState(true);
  const [breakdownLoading, setBreakdownLoading] = useState(true);

  const [script, setScript] = useState<ScriptDraft | null>(null);
  // Null until the server says what generation would use. Nothing renders a
  // question count before then, so the form can't show a number the backend
  // would disagree with.
  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  const [hasSavedTemplate, setHasSavedTemplate] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const { error, demoNotice, copied, runAction, copyInviteUrl } =
    useInviteActions();
  const [localError, setLocalError] = useState<string | null>(null);

  // Run context: job title for the header, and how many interviews already
  // exist so the template notice can be honest about what an edit reaches.
  useEffect(() => {
    getEvaluationRun(runId)
      .then((run) => {
        setJobTitle(run.job_title ?? null);
        setInterviewCount(
          run.items.filter((item) => item.interview !== null).length
        );
      })
      .catch(() => {})
      // Also on failure: the header can't wait forever for a fetch that will
      // never answer, and the name has a fallback for exactly this.
      .finally(() => setRunLoading(false));
  }, [runId]);

  useEffect(() => {
    getRunCandidateBreakdown(runId, candidateId)
      .then(setBreakdown)
      .catch(() => {})
      .finally(() => setBreakdownLoading(false));
  }, [runId, candidateId]);

  useEffect(() => {
    getInterviewTemplate(runId)
      .then((template: InterviewTemplateData) => {
        setTemplate(toDraft(template));
        setHasSavedTemplate(template.is_saved);
      })
      .catch(() => {});
  }, [runId]);

  /**
   * Load an existing draft, if there is one.
   *
   * Deliberately does NOT generate: arriving here is not consent to spend an
   * LLM call. Step 1 collects the settings first, and only "Generate
   * questions" calls the model. Revisiting a draft that already exists lands
   * straight on step 2.
   */
  const loadExisting = useCallback(
    () =>
      getRunCandidateInterview(runId, candidateId)
        .then((existing) => {
          setLocalError(null);
          if (existing) {
            setInterview(existing);
            setScript(scriptFrom(existing));
            if (existing.invite_url) setInviteUrl(existing.invite_url);
          }
        })
        .catch((err) => {
          setLocalError(
            err instanceof Error ? err.message : "Could not load the interview."
          );
        }),
    [runId, candidateId]
  );

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  /** Persist a template draft and adopt the server's echo of it. Shared by
   * every path that writes the template, so they can't drift on what gets
   * sent or what happens after. */
  const persistTemplate = async (draft: TemplateDraft): Promise<boolean> => {
    try {
      const saved = await saveInterviewTemplate(runId, {
        question_count: Number(draft.questionCount),
        followups_enabled: draft.followupsEnabled,
        time_limit_seconds: draft.timeLimitSeconds,
        opening: draft.opening.trim() || null,
        closing: draft.closing.trim() || null,
        fixed_questions: draft.fixedQuestions,
      });
      setTemplate(toDraft(saved));
      setHasSavedTemplate(true);
      return true;
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not save the template."
      );
      return false;
    }
  };

  /**
   * Save the template, then generate this candidate's questions.
   *
   * One button, two calls: the settings must be persisted before generation
   * reads them, and doing it here means the recruiter never has to save the
   * template as a separate act before continuing.
   */
  const handleGenerate = async () => {
    if (!template) return;
    setGenerating(true);
    setLocalError(null);
    try {
      if (!(await persistTemplate(template))) return;
      await createRunCandidateInterview(runId, candidateId);
      const created = await getRunCandidateInterview(runId, candidateId);
      if (created) {
        setInterview(created);
        setScript(scriptFrom(created));
      }
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not generate the questions."
      );
    } finally {
      setGenerating(false);
    }
  };

  /** Copy one reviewed question into the run's template. */
  const handleAddQuestionToTemplate = async (
    question: InterviewQuestionData
  ): Promise<boolean> => {
    if (!template) return false;
    const next: TemplateDraft = {
      ...template,
      fixedQuestions: [
        ...template.fixedQuestions,
        {
          text: question.text,
          focus: question.focus as FixedQuestionData["focus"],
          subject: question.subject,
        },
      ],
    };
    // A fixed question counts toward the total, so adding one to a full
    // template would make every future generation fail validation. Raise the
    // count with it, bounded by the same ceiling the editor enforces.
    const count = Number(next.questionCount);
    if (next.fixedQuestions.length > count) {
      next.questionCount = String(Math.min(count + 1, MAX_QUESTIONS));
    }
    setTemplate(next);
    return persistTemplate(next);
  };

  /** Ask the model for one more question for this candidate.
   *
   * Returns it rather than setting state: the view holds the draft and appends
   * it there, so this stays the same shape as every other action on the page
   * and can report failure by resolving null. */
  const handleGenerateQuestion = async (
    existing: InterviewQuestionData[]
  ): Promise<InterviewQuestionData | null> => {
    setLocalError(null);
    try {
      return await draftRunCandidateInterviewQuestion(
        runId,
        candidateId,
        existing
      );
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not write a question."
      );
      return null;
    }
  };

  /**
   * Save edits, then approve. Two calls rather than one: the PATCH is what
   * persists the recruiter's wording, and approving without it would mint a
   * link for the unedited script.
   */
  const handleApprove = async () => {
    if (!script) return;
    setIsApproving(true);
    setLocalError(null);
    try {
      // The PATCH returns the saved detail, so nothing needs refetching
      // between it and the approve: two calls, not three.
      const saved = await updateRunCandidateInterviewDraft(runId, candidateId, {
        opening: script.opening,
        questions: script.questions,
        closing: script.closing,
        followups_enabled: script.followupsEnabled,
        time_limit_seconds: script.timeLimitSeconds,
      });
      const summary = await approveRunCandidateInterview(runId, candidateId);
      setInterview({
        ...saved,
        status: summary.status,
        invite_url: summary.invite_url,
        access_token: summary.access_token,
        expires_at: summary.expires_at,
        approved_at: summary.approved_at,
      });
      setInviteUrl(summary.invite_url);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not approve the interview."
      );
    } finally {
      setIsApproving(false);
    }
  };

  const backHref = `/evaluation/${runId}?tab=interviews`;

  // Approved: the editor is gone for good — the script is frozen once a link
  // exists, so there is nothing left to review.
  if (inviteUrl) {
    return (
      <main className="px-6 py-10 max-w-3xl mx-auto min-h-[calc(100vh-80px)]">
        <ApprovedNotice
          inviteUrl={inviteUrl}
          copied={copied}
          backHref={backHref}
          onCopy={() => runAction(async () => copyInviteUrl(inviteUrl))}
        />
      </main>
    );
  }

  return (
    <InterviewReviewView
      backHref={backHref}
      candidateName={breakdown?.candidate_name ?? breakdown?.filename ?? null}
      jobTitle={jobTitle}
      interview={interview}
      generating={generating}
      script={script}
      onScriptChange={setScript}
      template={template}
      onTemplateChange={setTemplate}
      interviewCount={interviewCount}
      headerLoading={runLoading || breakdownLoading}
      hasSavedTemplate={hasSavedTemplate}
      isApproving={isApproving}
      error={localError ?? error}
      demoNotice={demoNotice}
      onGenerate={handleGenerate}
      onApprove={handleApprove}
      onAddQuestionToTemplate={handleAddQuestionToTemplate}
      onGenerateQuestion={handleGenerateQuestion}
    />
  );
}
