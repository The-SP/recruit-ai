"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { History, Loader2, Plus, Search } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  ListPagination,
  PAGE_SIZE,
  pageHref,
  parsePage,
} from "@/components/list-pagination";
import { RunsTable } from "@/components/runs-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePagedList } from "@/hooks/use-paged-list";
import { useUrlSearch } from "@/hooks/use-url-search";
import {
  deleteEvaluationRun,
  listEvaluationRuns,
  type EvaluationRunSummary,
} from "@/services/runs";
import { runDeleteDescription } from "@/lib/delete-copy";

// The search lives in the URL next to ?page= so a refresh or back keeps it,
// and a new search resets to page 1 in the same navigation.
function historyHref(page: number, q: string): string {
  return pageHref("/history", page, { q });
}

function HistoryPageInner() {
  const params = useSearchParams();
  const page = parsePage(params.get("page"));
  const q = params.get("q") ?? "";

  const fetchPage = useCallback(
    (limit: number, offset: number) =>
      listEvaluationRuns(limit, offset, q || undefined),
    [q]
  );
  const hrefFor = useCallback((p: number) => historyHref(p, q), [q]);
  const searchHref = useCallback((next: string) => historyHref(1, next), []);

  const { items, total, shownPage, loading, error, reload } = usePagedList({
    page,
    fetchPage,
    hrefFor,
    errorMessage: "Failed to load history.",
  });
  const [search, setSearch] = useUrlSearch(q, searchHref);
  // One dialog for the whole table, driven by whichever row is pending.
  const [pendingDelete, setPendingDelete] = useState<EvaluationRunSummary | null>(
    null
  );

  const handleDelete = async () => {
    if (!pendingDelete) return;
    await deleteEvaluationRun(pendingDelete.id);
    // Refetch so the next run slides onto this page and the total stays right.
    await reload();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Under a search, zero rows means "no match", not "no runs yet": keep the
  // header controls and skip the onboarding empty state.
  const hasRuns = items.length > 0 || q !== "";
  const ready = !loading && !error;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Same header shape as the dashboard: title left, primary action
          top-right, the action hidden when the empty state carries its own. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Evaluation history</h1>
          <p className="text-sm text-muted-foreground mt-0.5 min-h-5">
            {ready &&
              items.length > 0 &&
              // The footer carries the count once there is more than one page.
              (totalPages > 1
                ? "Click a run to see its results."
                : `${total} ${q ? "matching " : ""}${total === 1 ? "run" : "runs"}. Click a run to see its results.`)}
          </p>
        </div>
        {!loading && hasRuns && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by job title or company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Button asChild className="gap-1.5">
              <Link href="/dashboard/new">
                <Plus className="w-4 h-4" />
                New evaluation
              </Link>
            </Button>
          </div>
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

      {ready && q && items.length === 0 && (
        <Card className="p-12 text-center">
          <p className="font-semibold text-muted-foreground">
            No runs match this search
          </p>
        </Card>
      )}

      {ready && !hasRuns && (
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

      {ready && items.length > 0 && (
        <>
          <RunsTable runs={items} onDelete={setPendingDelete} showTime />
          {totalPages > 1 && (
            <ListPagination
              hrefFor={hrefFor}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              shownPage={shownPage}
              shownCount={items.length}
            />
          )}
        </>
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

// useSearchParams (the ?page= state) needs a Suspense boundary.
export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryPageInner />
    </Suspense>
  );
}
