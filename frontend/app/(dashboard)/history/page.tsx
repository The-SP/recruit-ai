"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, ExternalLink, History, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/services/api";
import { listEvaluationRuns, type EvaluationRunSummary } from "@/services/runs";
import { statusLabels, statusStyles } from "@/lib/evaluation-styles";

export default function HistoryPage() {
  const [items, setItems] = useState<EvaluationRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvaluationRuns(100)
      .then((res) => setItems(res.items))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load history.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-xl">
          <History className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Evaluation History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All your past evaluation runs — click View to see results.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading history…</span>
        </div>
      )}

      {error && (
        <Card className="p-6 text-center text-destructive border-destructive/30 bg-destructive/5">
          {error}
        </Card>
      )}

      {!loading && !error && items.length === 0 && (
        <Card className="p-12 text-center">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-muted-foreground">No runs yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            <Link href="/dashboard/new" className="text-primary hover:underline">
              Start your first evaluation
            </Link>{" "}
            to see results here.
          </p>
        </Card>
      )}

      {!loading && !error && items.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-center">Candidates</TableHead>
                <TableHead className="text-center">Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {item.job_title ?? (
                      <span className="text-muted-foreground italic">Untitled</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.company_name && item.company_name !== "null" ? item.company_name : "-"}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {item.total_count}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {item.processing_time_seconds != null
                      ? `${item.processing_time_seconds.toFixed(0)}s`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        statusStyles[item.status] ??
                        "bg-muted text-muted-foreground border-border"
                      }
                      variant="outline"
                    >
                      {statusLabels[item.status] ?? item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/evaluation/${item.id}`}>
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
