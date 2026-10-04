"use client";

import { Info,} from "lucide-react";
import { use, useEffect, useState } from "react";

import {
  toDraft,
  TemplateEditor,
  TemplateEditorSkeleton,
  type TemplateDraft,
} from "@/components/interview/template-editor";
import type { InterviewTemplateData } from "@/lib/interview-types";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import {
  getEvaluationRun,
  getInterviewTemplate,
  saveInterviewTemplate,
} from "@/services/runs";
import { useBreadcrumbLabel } from "@/components/dashboard-breadcrumbs";
import { ErrorBanner } from "@/components/ui/error-banner";

/** The fields a save would send, so "changed" means "would save something
 * different". allowedTimeLimits is server metadata, not a setting, and the
 * opening/closing are trimmed on save, so whitespace alone isn't an edit. */
function savedShape(draft: TemplateDraft): string {
  return JSON.stringify({
    questionCount: Number(draft.questionCount),
    followupsEnabled: draft.followupsEnabled,
    timeLimitSeconds: draft.timeLimitSeconds,
    opening: draft.opening.trim(),
    closing: draft.closing.trim(),
    fixedQuestions: draft.fixedQuestions,
  });
}

/**
 * Standalone template editor for a run.
 *
 * The same TemplateEditor the review page embeds as its first step, on its own
 * route so the settings can be reached without picking a candidate first —
 * they apply to the whole run, so requiring one was backwards. The way back
 * is the breadcrumb trail, like every other dashboard page.
 */
export default function InterviewTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: runId } = use(params);

  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  // What the server last returned, to tell an edited form from a clean one.
  const [savedTemplate, setSavedTemplate] = useState<TemplateDraft | null>(null);
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
        const draft = toDraft(data);
        setTemplate(draft);
        setSavedTemplate(draft);
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

  const isDirty =
    template !== null &&
    savedTemplate !== null &&
    savedShape(template) !== savedShape(savedTemplate);
  useUnsavedChangesGuard(isDirty);

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
      const draft = toDraft(saved);
      setTemplate(draft);
      setSavedTemplate(draft);
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Interview template</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {jobTitle ? `${jobTitle} · ` : ""}
          Applies to every new interview in this run. The questions themselves
          are still written per resume.
        </p>
      </div>

      {error && (
        <ErrorBanner>{error}</ErrorBanner>
      )}

      {/* Up top rather than under the card, where it sat below the fold. */}
      {!hasSaved && template && (
        <div className="bg-muted/50 border border-border text-muted-foreground text-sm px-4 py-3 rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Nothing saved yet. These are the defaults new interviews use until
            you save.
          </p>
        </div>
      )}

      {template ? (
        <TemplateEditor
          draft={template}
          onChange={setTemplate}
          interviewCount={interviewCount}
          isSaving={isSaving}
          variant="page"
          onSave={handleSave}
          isDirty={isDirty}
          justSaved={savedAt !== null && !isDirty}
          canSaveUnchanged={!hasSaved}
        />
      ) : (
        !error && <TemplateEditorSkeleton variant="page" />
      )}
    </div>
  );
}
