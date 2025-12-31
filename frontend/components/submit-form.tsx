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
    <Card className="max-w-3xl mx-auto p-0 shadow-xl border-zinc-200/60 overflow-hidden">
      <div className="bg-zinc-950 px-8 py-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            New Evaluation
          </h2>
          <p className="text-zinc-400 text-sm mt-1">Fill in the details to start the AI screening</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm p-4 rounded-xl flex items-start gap-3">
            <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6 md:col-span-2">
            <div className="space-y-3">
              <Label htmlFor="job-description" className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-600" />
                Job Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="job-description"
                placeholder="Paste the job description or requirements here..."
                rows={8}
                required
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="resize-none border-zinc-200 focus:ring-blue-500 focus:border-blue-500 rounded-xl bg-zinc-50/30"
              />
            </div>
          </div>

          <div className="space-y-6 md:col-span-2">
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Candidate Resumes <span className="text-red-500">*</span>
              </Label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`group relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${
                  filesError
                    ? "border-red-400 bg-red-50/50"
                    : isDragging
                      ? "border-blue-500 bg-blue-50"
                      : "border-zinc-200 bg-zinc-50/50 hover:border-blue-400 hover:bg-blue-50"
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
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${filesError ? "bg-red-100 text-red-600" : "bg-white text-blue-600 shadow-sm group-hover:bg-blue-600 group-hover:text-white"}`}>
                    <Upload className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-zinc-900 font-bold">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">
                      Support multiple PDF resumes
                    </p>
                  </div>
                </div>
              </div>
              {filesError && (
                <p className="text-sm font-medium text-red-500 flex items-center gap-1.5 ml-1">
                  <X className="w-4 h-4" /> {filesError}
                </p>
              )}

              {files.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between px-4 py-3 bg-white border border-zinc-200 rounded-xl shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold text-zinc-900 truncate">
                            {file.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-medium">
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
                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6 md:col-span-2 pt-4">
            <div className="space-y-3">
              <Label htmlFor="email" className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                Notification Email <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="hr@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-4 h-12 border-zinc-200 focus:ring-blue-500 focus:border-blue-500 rounded-xl bg-zinc-50/30"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400">
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${email.includes('@') && email.includes('.') ? "text-green-500" : "opacity-0"}`} />
                </div>
              </div>
              <p className="text-xs text-zinc-500 font-medium ml-1">
                We&apos;ll notify you here as soon as the results are ready.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <Button
            type="submit"
            className="group relative w-full h-14 text-base font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing Resumes...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 w-full">
                <span>Submit for Evaluation</span>
                <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              </div>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
