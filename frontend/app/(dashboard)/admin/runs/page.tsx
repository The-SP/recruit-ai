"use client";

import { useEffect, useState } from "react";
import { Layers, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/services/api";
import { listAllRuns, type AdminRunRow } from "@/services/admin";
import { statusLabels, statusStyles } from "@/lib/evaluation-styles";

// "all" is the sentinel for no filter — Radix Select cannot hold an empty
// string value. Draft is offered explicitly because the backend drops drafts
// from the unfiltered list.
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "processing", label: "Processing" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "draft", label: "Draft (abandoned)" },
];

export default function AdminRunsPage() {
  const [items, setItems] = useState<AdminRunRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce keystrokes so each character doesn't fire its own request.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    // `cancelled` drops a response whose filter has since been changed, so a
    // fast switch can't leave the slower request's rows on screen.
    let cancelled = false;
    listAllRuns(
      100,
      0,
      status === "all" ? undefined : status,
      debouncedSearch || undefined,
    )
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load runs.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, debouncedSearch]);

  // The spinner is reset here rather than in the effect: setState in an effect
  // body cascades renders, and the filter change is the real trigger anyway.
  function handleStatusChange(next: string) {
    setStatus(next);
    setLoading(true);
    setError(null);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">All runs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every evaluation run across all accounts, newest first.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by job title or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading runs…</span>
        </div>
      )}

      {error && (
        <Card className="p-6 text-center text-destructive border-destructive/30 bg-destructive/5">
          {error}
        </Card>
      )}

      {!loading && !error && items.length === 0 && (
        <Card className="p-12 text-center">
          <p className="font-semibold text-muted-foreground">
            No runs match this {debouncedSearch ? "search" : "filter"}
          </p>
        </Card>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            Showing {items.length} of {total}
          </p>
          <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
            <div className="overflow-x-auto">
              <Table className="[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4">
                <TableHeader>
                  <TableRow className="bg-foreground/[0.06] hover:bg-foreground/[0.06] border-b-2 border-foreground/15">
                    <TableHead>Date</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Submitted By</TableHead>
                    <TableHead className="text-center">Resumes</TableHead>
                    <TableHead className="text-center">Failed</TableHead>
                    <TableHead className="text-center">Time</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:border-foreground/10 [&_td]:py-3">
                  {items.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(run.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium max-w-56 truncate">
                        {run.job_title ?? (
                          <span className="text-muted-foreground italic">Untitled</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {run.owner_email ? (
                          <span className="text-muted-foreground">{run.owner_email}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Anonymous</Badge>
                            {run.contact_email && (
                              <span className="text-xs text-muted-foreground truncate">
                                {run.contact_email}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {run.processed_count}/{run.total_count}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {run.failed_count > 0 ? (
                          <span className="text-error-foreground font-medium">
                            {run.failed_count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {run.processing_time_seconds != null
                          ? `${run.processing_time_seconds.toFixed(0)}s`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            statusStyles[run.status] ??
                            "bg-muted text-muted-foreground border-border"
                          }
                          variant="outline"
                        >
                          {statusLabels[run.status] ?? run.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
