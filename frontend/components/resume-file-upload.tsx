"use client";

import { FileText, Upload, X } from "lucide-react";
import { useCallback, useState } from "react";

import { Label } from "@/components/ui/label";

interface ResumeFileUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  error?: string | null;
}

export function ResumeFileUpload({ files, onChange, error }: ResumeFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (newFiles: FileList | null) => {
      if (!newFiles) return;

      const incoming = Array.from(newFiles).filter(
        (f) => f.type === "application/pdf"
      );

      const unique = incoming.filter(
        (nf) => !files.some((ef) => ef.name === nf.name)
      );

      onChange([...files, ...unique]);
    },
    [files, onChange]
  );

  const removeFile = useCallback(
    (index: number) => {
      onChange(files.filter((_, i) => i !== index));
    },
    [files, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
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
          error
            ? "border-destructive bg-destructive/5"
            : isDragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5"
        }`}
        onClick={() => document.getElementById("resume-file-input")?.click()}
      >
        <input
          id="resume-file-input"
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-4">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              error
                ? "bg-destructive/10 text-destructive"
                : "bg-background text-primary shadow-sm group-hover:bg-primary group-hover:text-primary-foreground group-hover:rotate-6"
            }`}
          >
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
      {error && (
        <p className="text-sm font-semibold text-destructive flex items-center gap-2 ml-1 animate-in fade-in slide-in-from-left-2">
          <X className="w-4 h-4" /> {error}
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
  );
}
