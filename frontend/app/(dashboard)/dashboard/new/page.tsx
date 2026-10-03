"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ResumeFileUpload } from "@/components/resume-file-upload";
import { ApiError } from "@/services/api";
import { createEvaluationRun } from "@/services/runs";
import { cn } from "@/lib/utils";

type Step = 1 | 2;

// Step-1 fields, keyed by the names the backend sends back in a 400's `field`.
type Step1Field = "job_title" | "company_name" | "job_text";
type FieldErrors = Partial<Record<Step1Field, string>>;

const FIELD_INPUT_ID: Record<Step1Field, string> = {
  job_title: "job-title",
  company_name: "company-name",
  job_text: "job-text",
};

const isStep1Field = (field: string | undefined): field is Step1Field =>
  field !== undefined && field in FIELD_INPUT_ID;

function FieldError({ field, message }: { field: Step1Field; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={`${FIELD_INPUT_ID[field]}-error`}
      className="text-sm text-destructive font-medium"
    >
      {message}
    </p>
  );
}

// Titles match the first two steps of components/dashboard-onboarding.tsx, so
// the wizard reads as a continuation of the card the user just clicked from.
const STEPS = ["Paste a job description", "Upload resumes"] as const;

function WizardSteps({ current }: { current: Step }) {
  return (
    <ol className="flex items-center gap-3">
      {STEPS.map((title, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <Fragment key={title}>
            {i > 0 && <li aria-hidden className="h-px flex-1 bg-border" />}
            <li
              className="flex items-center gap-3 min-w-0"
              aria-current={active ? "step" : undefined}
            >
              <div
                className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                  done || active
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "border bg-card text-muted-foreground"
                )}
              >
                {done ? <Check className="w-4 h-4" /> : n}
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  !done && !active && "text-muted-foreground"
                )}
              >
                {title}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

export default function NewEvaluationPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobText, setJobText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Set alongside new field errors, not derived from them, so clearing one
  // error while typing doesn't yank focus to another field.
  const focusField = useRef<Step1Field | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Runs after render, so a bounce back from step 2 focuses the field once
  // step 1 is mounted again.
  useEffect(() => {
    if (step !== 1 || !focusField.current) return;
    document.getElementById(FIELD_INPUT_ID[focusField.current])?.focus();
    focusField.current = null;
  }, [step, fieldErrors]);

  function clearFieldError(field: Step1Field) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function fieldProps(field: Step1Field) {
    const invalid = Boolean(fieldErrors[field]);
    return {
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `${FIELD_INPUT_ID[field]}-error` : undefined,
    };
  }

  function handleNextStep() {
    const errors: FieldErrors = {};
    if (!jobTitle.trim()) errors.job_title = "Enter a job title.";
    if (!jobText.trim()) errors.job_text = "Paste a job description.";
    setFieldErrors(errors);
    const first = (Object.keys(FIELD_INPUT_ID) as Step1Field[]).find(
      (f) => errors[f]
    );
    if (first) {
      focusField.current = first;
      return;
    }
    setError(null);
    setStep(2);
  }

  async function handleSubmit() {
    if (files.length === 0) {
      setFileError("Upload at least one PDF resume.");
      return;
    }
    setFileError(null);
    setSubmitting(true);
    try {
      const run = await createEvaluationRun(
        jobTitle.trim(),
        companyName.trim(),
        jobText,
        files
      );
      router.push(`/evaluation/${run.id}`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && isStep1Field(err.field)) {
        // The fix is on step 1 (e.g. the text isn't a job description), so
        // go back there. The picked files are kept in state for the return.
        setFieldErrors({ [err.field]: err.message });
        focusField.current = err.field;
        setStep(1);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* No header CTA: the wizard's primary action is the card's own button. */}
      <div>
        <h1 className="text-2xl font-bold">New evaluation</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Score candidate resumes against a job description.
        </p>
      </div>

      <WizardSteps current={step} />

      {step === 1 && (
        <Card className="p-6 gap-8">
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-title">Job title</Label>
              <Input
                className="h-12 px-4 md:text-base"
                id="job-title"
                placeholder="e.g. Senior Software Engineer"
                required
                value={jobTitle}
                onChange={(e) => {
                  setJobTitle(e.target.value);
                  clearFieldError("job_title");
                }}
                {...fieldProps("job_title")}
              />
              <FieldError field="job_title" message={fieldErrors.job_title} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-name">
                Company name
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                className="h-12 px-4 md:text-base"
                id="company-name"
                placeholder="e.g. Acme Inc."
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  clearFieldError("company_name");
                }}
                {...fieldProps("company_name")}
              />
              <FieldError field="company_name" message={fieldErrors.company_name} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-text">Job description</Label>
            <Textarea
              id="job-text"
              placeholder="Paste the full job description here: requirements, responsibilities, qualifications…"
              className="min-h-48 max-h-80 overflow-y-auto resize-none px-4 py-3 md:text-base"
              value={jobText}
              onChange={(e) => {
                setJobText(e.target.value);
                clearFieldError("job_text");
              }}
              {...fieldProps("job_text")}
            />
            <FieldError field="job_text" message={fieldErrors.job_text} />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleNextStep} className="w-full sm:w-auto gap-2">
              Next: upload resumes
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 gap-8">
          {/* No edit link here: Back below is the one way to step 1. */}
          <div className="pb-5 border-b min-w-0">
            <p className="text-sm text-muted-foreground">Evaluating for</p>
            <p className="font-medium mt-0.5 line-clamp-2">
              {jobTitle.trim()}
              {companyName.trim() && ` at ${companyName.trim()}`}
            </p>
          </div>

          <ResumeFileUpload
            files={files}
            onChange={(f) => {
              setFiles(f);
              if (fileError) setFileError(null);
            }}
            error={fileError}
          />

          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="w-full sm:w-auto gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              size="lg"
              disabled={submitting || files.length === 0}
              className="group w-full sm:w-auto gap-2 h-11 px-6 has-[>svg]:px-6 text-base font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-shadow"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  Start evaluation
                  <Sparkles className="w-4 h-4 motion-safe:group-hover:rotate-12 transition-[rotate] duration-300" />
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
