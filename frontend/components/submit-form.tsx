"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FileText, Mail, Upload, Briefcase, X } from "lucide-react";
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

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const pdfFiles = Array.from(newFiles).filter(
      (f) => f.type === "application/pdf"
    );
    setFiles((prev) => [...prev, ...pdfFiles]);
    setFilesError(null);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, []);

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
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <Card className="max-w-3xl mx-auto p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="job-description" className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-600" />
            Job Description <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="job-description"
            placeholder="Paste the job description here..."
            rows={6}
            required
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            className="resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            Resume PDFs <span className="text-red-500">*</span>
          </Label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              filesError
                ? "border-red-500 bg-red-50"
                : isDragging
                  ? "border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100"
                  : "border-zinc-200 bg-zinc-50 hover:border-blue-300 hover:bg-gradient-to-br hover:from-blue-50 hover:to-white"
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
            <div className="flex flex-col items-center gap-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${filesError ? "bg-red-100" : "bg-blue-100"}`}>
                <Upload className={`w-6 h-6 ${filesError ? "text-red-600" : "text-blue-600"}`} />
              </div>
              <p className="text-zinc-700 font-medium">
                Choose PDF files or drag and drop
              </p>
              <p className="text-xs text-zinc-500">
                Upload multiple resume PDFs
              </p>
            </div>
          </div>
          {filesError && (
            <p className="text-sm text-red-500">{filesError}</p>
          )}

          {files.length > 0 && (
            <div className="border rounded-md divide-y bg-white">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    <span className="text-zinc-900 truncate">{file.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            Email Address <span className="text-red-500">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-zinc-500">
            We&apos;ll notify you when results are ready
          </p>
        </div>

        <Button
          type="submit"
          className="w-full py-6 text-base cursor-pointer"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Processing..." : "Submit for Evaluation"}
        </Button>
      </form>
    </Card>
  );
}
