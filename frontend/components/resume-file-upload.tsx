"use client";

import { AlertCircle, FileText, Upload, X } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ResumeFileUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  error?: string | null;
}

const fileKey = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function ResumeFileUpload({ files, onChange, error }: ResumeFileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Files dropped on the way in, so they don't vanish without a word.
  const [skipped, setSkipped] = useState<string | null>(null);

  const handleFiles = useCallback(
    (newFiles: FileList | null) => {
      if (!newFiles) return;

      const all = Array.from(newFiles);
      const pdfs = all.filter((f) => f.type === "application/pdf");
      const unique = pdfs.filter(
        (nf) => !files.some((ef) => ef.name === nf.name)
      );

      const notPdf = all.length - pdfs.length;
      const duplicates = pdfs.length - unique.length;
      const reasons = [
        notPdf > 0 && `${notPdf} not a PDF`,
        duplicates > 0 && `${duplicates} already added`,
      ].filter(Boolean);
      setSkipped(
        reasons.length > 0
          ? `Skipped ${notPdf + duplicates} ${notPdf + duplicates === 1 ? "file" : "files"}: ${reasons.join(", ")}.`
          : null
      );

      if (unique.length > 0) onChange([...files, ...unique]);
    },
    [files, onChange]
  );

  const removeFile = useCallback(
    (index: number) => {
      onChange(files.filter((_, i) => i !== index));
    },
    [files, onChange]
  );

  const clearAll = useCallback(() => {
    setSkipped(null);
    onChange([]);
  }, [onChange]);

  const openPicker = () => inputRef.current?.click();

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

  return (
    <div className="space-y-3">
      <Label htmlFor={inputId}>
        <FileText className="w-4 h-4 text-muted-foreground" />
        Candidate resumes
      </Label>
      <div
        role="button"
        tabIndex={0}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "group min-h-48 flex items-center justify-center border-2 border-dashed rounded-2xl px-6 py-8 text-center cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          error
            ? "border-destructive bg-destructive/5"
            : isDragging
              ? "border-primary bg-primary/10"
              : "border-border bg-muted/30 hover:border-primary hover:bg-primary/5"
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Let the same file be picked again after removing it.
            e.target.value = "";
          }}
        />
        {/* pointer-events-none stops dragleave firing as the cursor crosses
            the children, which made the highlight flicker. */}
        <div className="flex flex-col items-center gap-3 pointer-events-none">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-[color,background-color,rotate] duration-300",
              error
                ? "bg-destructive/10 text-destructive"
                : isDragging
                  ? "bg-primary/10 text-primary motion-safe:rotate-6"
                  : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary motion-safe:group-hover:rotate-6"
            )}
          >
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Click to upload or drag and drop</p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF only. You can add several at once.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p
          id={`${inputId}-error`}
          className="text-sm font-medium text-destructive flex items-center gap-1.5"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </p>
      )}
      {skipped && <p className="text-sm text-muted-foreground">{skipped}</p>}

      {files.length > 0 && (
        <div className="border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
            <p className="text-sm text-muted-foreground">
              {files.length} {files.length === 1 ? "resume" : "resumes"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-7 text-muted-foreground"
            >
              Clear all
            </Button>
          </div>
          <ul className="divide-y max-h-72 overflow-y-auto">
            {files.map((file, index) => (
              <li
                key={fileKey(file)}
                className="flex items-center gap-3 pl-4 pr-2 py-2.5"
              >
                <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm truncate flex-1 min-w-0">{file.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                  {formatFileSize(file.size)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                  className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
