"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FileText, Mail, Upload, Briefcase, X, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SubmitForm() {
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    
    const incomingFiles = Array.from(newFiles).filter(
      (f) => f.type === "application/pdf"
    );

    setFiles((prev) => {
      const uniqueNewFiles = incomingFiles.filter(newFile => 
        !prev.some(existingFile => existingFile.name === newFile.name)
      );

      if (uniqueNewFiles.length < incomingFiles.length) {
        setFilesError("Some duplicate files were skipped");
      } else {
        setFilesError(null);
      }

      return [...prev, ...uniqueNewFiles];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setFilesError("At least one resume PDF is required");
      }
      return next;
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (files.length === 0) {
      setFilesError("At least one resume PDF is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("job_text", jobDescription);
      formData.append("email", email);
      files.forEach((file) => formData.append("files", file));

      const res = await fetch("http://localhost:8000/batch/submit", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Submission failed");
      }

      const data = await res.json();
      router.push(`/evaluation?token=${data.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${Math.round(bytes / 1024)} KB`;
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

          <div className="space-y-4">
            <Label className="text-sm font-bold text-foreground flex items-center gap-2.5 ml-1">
              <FileText className="w-4 h-4 text-primary" />
              Candidate Resumes <span className="text-destructive">*</span>
            </Label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`group relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300 ${
                filesError
                  ? "border-destructive bg-destructive/5"
                  : isDragging
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5"
              }`}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="flex flex-col items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${filesError ? "bg-destructive/10 text-destructive" : "bg-background text-primary shadow-sm group-hover:bg-primary group-hover:text-primary-foreground group-hover:rotate-6"}`}>
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-foreground font-black text-lg tracking-tight">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-sm text-muted-foreground mt-1.5 font-medium">
                    Support multiple PDF resumes
                  </p>
                </div>
              </div>
            </div>
            {filesError && (
              <p className="text-sm font-semibold text-destructive flex items-center gap-2 ml-1 animate-in fade-in slide-in-from-left-2">
                <X className="w-4 h-4" /> {filesError}
              </p>
            )}

            {files.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-5 py-4 bg-background border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-primary/20 transition-all group animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="p-2.5 bg-primary/10 text-primary rounded-xl group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-foreground truncate">
                          {file.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-bold">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
