"use client";

import { Clock, ExternalLink, History, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

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
import { HistoryItem, getHistory } from "@/services/batch";

const statusStyles: Record<string, string> = {
  completed: "bg-success text-success-foreground border-success-edge",
  processing: "bg-info text-info-foreground border-info-edge",
  pending: "bg-warning text-warning-foreground border-warning-edge",
  failed: "bg-error text-error-foreground border-error-edge",
};

const statusLabels: Record<string, string> = {
  completed: "Completed",
  processing: "Processing",
  pending: "Pending",
  failed: "Failed",
};

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHistory()
      .then((res) => setItems(res.items))
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load history.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-primary/10 p-2 rounded-xl">
          <History className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Evaluation History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Past evaluation runs — click View Results to revisit any batch.
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
            Submit a batch on the{" "}
            <Link href="/" className="text-primary hover:underline">
              home page
            </Link>{" "}
            to get started.
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.token}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {item.job_title ?? (
                      <span className="text-muted-foreground italic">
                        Unknown
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.company_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {item.candidate_count}
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
                      <Link href={`/evaluation?token=${item.token}`}>
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        View Results
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
