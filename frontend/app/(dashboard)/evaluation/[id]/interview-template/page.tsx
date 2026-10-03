"use client";

import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import {
  toDraft,
  TemplateEditor,
  TemplateEditorSkeleton,
  type TemplateDraft,
} from "@/components/interview/template-editor";
import type { InterviewTemplateData } from "@/lib/interview-types";
import {
  getEvaluationRun,
  getInterviewTemplate,
  saveInterviewTemplate,
} from "@/services/runs";
import { useBreadcrumbLabel } from "@/components/dashboard-breadcrumbs";

/**
 * Standalone template editor for a run.
 *
 * The same TemplateEditor the review page embeds as its first step, on its own
 * route so the settings can be reached without picking a candidate first —
 * they apply to the whole run, so requiring one was backwards.
 */
export default function InterviewTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: runId } = use(params);

  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  useBreadcrumbLabel(runId, jobTitle);
  const [interviewCount, setInterviewCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    getInterviewTemplate(runId)
      .then((data: InterviewTemplateData) => {
        setTemplate(toDraft(data));
        setHasSaved(data.is_saved);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not load the template."
        )
      );
  }, [runId]);

  useEffect(() => {
    getEvaluationRun(runId)
      .then((run) => {
        setJobTitle(run.job_title ?? null);
        setInterviewCount(
          run.items.filter((item) => item.interview !== null).length
        );
      })
      .catch(() => {});
  }, [runId]);

  const handleSave = async (): Promise<boolean> => {
    if (!template) return false;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await saveInterviewTemplate(runId, {
        question_count: Number(template.questionCount),
        followups_enabled: template.followupsEnabled,
        time_limit_seconds: template.timeLimitSeconds,
        opening: template.opening.trim() || null,
        closing: template.closing.trim() || null,
        fixed_questions: template.fixedQuestions,
      });
      setTemplate(toDraft(saved));
      setHasSaved(true);
      setSavedAt(Date.now());
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the template."
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="px-6 py-10 max-w-3xl mx-auto min-h-[calc(100vh-80px)]">
      <div className="pb-6 border-b border-border space-y-4">
        <Link
          href={`/evaluation/${runId}?tab=interviews`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to results
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            Interview template
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {jobTitle ? `${jobTitle} · ` : ""}
            Applies to every interview generated from this run
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-5 bg-error border border-error-edge text-error-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
          <X className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      <div className="py-6 space-y-4">
        {template ? (
          <TemplateEditor
            draft={template}
            onChange={setTemplate}
            interviewCount={interviewCount}
            isSaving={isSaving}
            variant="page"
            onSave={handleSave}
          />
        ) : (
          <TemplateEditorSkeleton />
        )}

        {savedAt !== null && (
          <p className="text-sm font-medium text-success-foreground">
            Template saved. New interviews will use these settings.
          </p>
        )}

        {!hasSaved && template && (
          <p className="text-xs text-muted-foreground">
            Nothing saved yet — these are the defaults new interviews would use.
          </p>
        )}
      </div>
    </main>
  );
}
