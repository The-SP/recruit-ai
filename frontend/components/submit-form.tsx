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
      const data = await submitBatch(jobDescription, email, files);
      router.push(`/evaluation?token=${data.token}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-3xl mx-auto p-0 shadow-2xl border-border overflow-hidden rounded-3xl">
      <div className="bg-primary px-8 py-8 text-primary-foreground flex items-center justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
        <div className="relative z-10">
          <h2 className="text-2xl font-black flex items-center gap-3 tracking-tight">
            <Sparkles className="w-6 h-6 text-primary-foreground/80" />
            New Evaluation
          </h2>
          <p className="text-primary-foreground/70 text-sm mt-1.5 font-medium">Fill in the details to start the AI screening</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-10">
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

        <div className="space-y-10">
          <div className="space-y-4">
            <Label htmlFor="job-description" className="text-sm font-bold text-foreground flex items-center gap-2.5 ml-1">
              <Briefcase className="w-4 h-4 text-primary" />
              Job Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="job-description"
              placeholder="Paste the job description or requirements here..."
              rows={8}
              required
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              className="resize-none border-border focus:ring-primary focus:border-primary rounded-2xl bg-muted/30 p-4 text-base transition-all"
            />
          </div>

          <ResumeFileUpload
            files={files}
            onChange={handleFilesChange}
            error={filesError}
          />

          <div className="space-y-4 pt-2">
            <Label htmlFor="email" className="text-sm font-bold text-foreground flex items-center gap-2.5 ml-1">
              <Mail className="w-4 h-4 text-primary" />
              Notification Email <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                placeholder="hr@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-5 h-14 border-border focus:ring-primary focus:border-primary rounded-2xl bg-muted/30 text-base"
              />
              <div className="absolute right-5 top-1/2 -translate-y-1/2">
                <CheckCircle2 className={`w-6 h-6 transition-all duration-300 ${email.includes('@') && email.includes('.') ? "text-emerald-500 scale-100 opacity-100" : "scale-50 opacity-0"}`} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-semibold ml-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
              We&apos;ll notify you here as soon as the results are ready.
            </p>
          </div>
        </div>

        <div className="pt-6">
          <Button
            type="submit"
            className="group relative w-full h-16 text-lg font-black bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 cursor-pointer"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Processing Resumes...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 w-full">
                <span>Submit for Evaluation</span>
                <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
              </div>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
