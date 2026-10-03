"use client";

import {
    Briefcase, CheckCircle2, Info, Loader2, Mail, Sparkles, X
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DemoBanner } from '@/components/demo-banner';
import { ResumeFileUpload } from '@/components/resume-file-upload';
import { IS_DEMO_MODE } from '@/lib/demo';
import { MAX_ANONYMOUS_RESUMES } from '@/lib/evaluation-types';
import { ApiError } from '@/services/api';
import { submitBatch } from '@/services/batch';

export function SubmitForm() {
  const router = useRouter();
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);

  // Capped here rather than inside ResumeFileUpload: that component is shared
  // with the signed-in add-candidates panels, which stay uncapped.
  const handleFilesChange = (newFiles: File[]) => {
    if (newFiles.length === 0) {
      setFiles(newFiles);
      setFilesError("At least one resume PDF is required");
      return;
    }

    if (newFiles.length > MAX_ANONYMOUS_RESUMES) {
      setFiles(newFiles.slice(0, MAX_ANONYMOUS_RESUMES));
      setFilesError(
        `Up to ${MAX_ANONYMOUS_RESUMES} resumes without an account. ` +
          "Sign in to evaluate more."
      );
      return;
    }

    setFiles(newFiles);
    setFilesError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (files.length === 0) {
      setFilesError("At least one resume PDF is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitBatch(
        jobTitle.trim(),
        companyName.trim(),
        jobDescription,
        email,
        files
      );
      router.push(`/evaluation?token=${data.token}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-3xl mx-auto p-0 gap-0 shadow-2xl border-border overflow-hidden rounded-3xl">
      <div className="bg-primary px-6 py-6 sm:px-8 sm:py-8 text-primary-foreground flex items-center justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
        <div className="relative z-10">
          <h2 className="text-2xl font-black flex items-center gap-3 tracking-tight">
            <Sparkles className="w-6 h-6 text-primary-foreground/80" />
            New evaluation
          </h2>
          <p className="text-primary-foreground/70 text-sm mt-1.5 font-medium">Fill in the details to start the AI screening</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
        {IS_DEMO_MODE && <DemoBanner variant="submit" />}

        {/* Stated up front rather than on rejection: people shouldn't discover
            the boundary after picking twenty files. */}
        <div className="bg-muted/50 border border-border text-sm p-4 rounded-2xl flex items-start gap-3">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary" />
          <p className="text-muted-foreground font-medium">
            Try it out with up to {MAX_ANONYMOUS_RESUMES} resumes, no account
            needed.{" "}
            <Link
              href="/login"
              className="font-semibold text-primary hover:underline"
            >
              Sign in
            </Link>{" "}
            to evaluate more and to interview candidates with AI.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="font-semibold">{error}</p>
          </div>
        )}

        <div className="space-y-8">
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-title">Job title</Label>
              <Input
                className="h-12 px-4 md:text-base"
                id="job-title"
                placeholder="e.g. Senior Software Engineer"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
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
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-description">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              Job description
            </Label>
            <Textarea
              id="job-description"
              placeholder="Paste the full job description here: requirements, responsibilities, qualifications…"
              className="min-h-48 max-h-80 overflow-y-auto resize-none px-4 py-3 md:text-base"
              required
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>

          <ResumeFileUpload
            files={files}
            onChange={handleFilesChange}
            error={filesError}
          />

          {/* The one field the wizard doesn't have: anonymous runs have no
              account to notify, so the results link goes to this address. */}
          <div className="space-y-2">
            <Label htmlFor="email">
              <Mail className="w-4 h-4 text-muted-foreground" />
              Notification email
            </Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                placeholder="hr@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 px-4 md:text-base pr-11"
              />
              <CheckCircle2
                className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary transition-opacity duration-300 ${email.includes("@") && email.includes(".") ? "opacity-100" : "opacity-0"}`}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              We&apos;ll email you a link as soon as the results are ready.
            </p>
          </div>
        </div>

        {/* Same button as the signed-in wizard's final step. */}
        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="group w-full sm:w-auto gap-2 h-11 px-6 has-[>svg]:px-6 text-base font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-shadow"
          >
            {isSubmitting ? (
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
      </form>
    </Card>
  );
}
