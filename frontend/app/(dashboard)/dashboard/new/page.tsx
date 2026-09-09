"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ResumeFileUpload } from "@/components/resume-file-upload";
import { ApiError } from "@/services/api";
import { createEvaluationRun } from "@/services/runs";

type Step = 1 | 2;

export default function NewEvaluationPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobText, setJobText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleNextStep() {
    if (!jobTitle.trim()) {
      setError("Please enter a job title.");
      return;
    }
    if (!jobText.trim()) {
      setError("Please paste a job description.");
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
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">New Evaluation</h1>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <div
            className={`h-2 flex-1 rounded-full transition-colors ${
              step >= 1 ? "bg-primary" : "bg-muted"
            }`}
          />
          <div
            className={`h-2 flex-1 rounded-full transition-colors ${
              step >= 2 ? "bg-primary" : "bg-muted"
            }`}
          />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Step {step} of 2 —{" "}
          {step === 1 ? "Paste your job description" : "Upload candidate resumes"}
        </p>
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-title" className="font-semibold">
                Job Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="job-title"
                placeholder="e.g. Senior Software Engineer"
                required
                value={jobTitle}
                onChange={(e) => {
                  setJobTitle(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-name" className="font-semibold">
                Company Name
              </Label>
              <Input
                id="company-name"
                placeholder="e.g. Acme Inc."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-text" className="font-semibold">
              Job Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="job-text"
              placeholder="Paste the full job description here — requirements, responsibilities, qualifications…"
              className="min-h-64 resize-none text-sm"
              value={jobText}
              onChange={(e) => {
                setJobText(e.target.value);
                if (error) setError(null);
              }}
            />
            {error && (
              <p className="text-sm text-destructive font-medium">{error}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleNextStep} className="gap-2">
              Next: Upload Resumes
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-5">
          <div className="flex items-start gap-3 pb-1 border-b">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                Evaluating for
              </p>
              <p className="text-sm font-medium mt-0.5 line-clamp-2">
                {jobTitle.trim()}
                {companyName.trim() && ` at ${companyName.trim()}`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(1)}
              className="text-muted-foreground gap-1 -mt-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Edit JD
            </Button>
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

          <div className="flex items-center justify-between pt-1">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || files.length === 0}
              className="gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  Start Evaluation
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
