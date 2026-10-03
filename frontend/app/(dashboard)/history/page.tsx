"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, Loader2, Plus } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { RunsTable } from "@/components/runs-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/services/api";
import {
  deleteEvaluationRun,
  listEvaluationRuns,
  type EvaluationRunSummary,
} from "@/services/runs";
import { runDeleteDescription } from "@/lib/delete-copy";

export default function HistoryPage() {
  const [items, setItems] = useState<EvaluationRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // One dialog for the whole table, driven by whichever row is pending.
  const [pendingDelete, setPendingDelete] = useState<EvaluationRunSummary | null>(
    null
  );

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    await deleteEvaluationRun(id);
    // Nothing on this page is derived from the list, so filtering is enough.
    setItems((prev) => prev.filter((run) => run.id !== id));
  };

  useEffect(() => {
    listEvaluationRuns(100)
      .then((res) => setItems(res.items))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load history.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Same header shape as the dashboard: title left, primary action
          top-right, the action hidden when the empty state carries its own. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Evaluation history</h1>
          <p className="text-sm text-muted-foreground mt-0.5 min-h-5">
            {!loading &&
              !error &&
              items.length > 0 &&
              `${items.length} ${items.length === 1 ? "run" : "runs"}. Click a run to see its results.`}
          </p>
        </div>
        {!loading && !error && items.length > 0 && (
          <Button asChild className="gap-1.5">
            <Link href="/dashboard/new">
              <Plus className="w-4 h-4" />
              New evaluation
            </Link>
          </Button>
        )}
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
        <Card className="p-12 items-center text-center gap-0">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <History className="w-6 h-6 text-primary" />
          </div>
          <p className="font-semibold">No evaluations yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
            Every evaluation you run is saved here, with its candidates, scores
            and interviews.
          </p>
          <Button asChild className="gap-1.5">
            <Link href="/dashboard/new">
              <Plus className="w-4 h-4" />
              New evaluation
            </Link>
          </Button>
        </Card>
      )}

      {!loading && !error && items.length > 0 && (
        <RunsTable runs={items} onDelete={setPendingDelete} showTime />
      )}

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this evaluation run?"
        description={
          pendingDelete ? runDeleteDescription(pendingDelete) : null
        }
        confirmLabel="Delete run"
        onConfirm={handleDelete}
      />
    </div>
  );
}
