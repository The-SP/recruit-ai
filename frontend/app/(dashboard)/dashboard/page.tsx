"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Layers, MessageSquareText, Plus, Users } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { DashboardAttention } from "@/components/dashboard-attention";
import { DashboardOnboarding } from "@/components/dashboard-onboarding";
import { RunsTable } from "@/components/runs-table";
import { StatCell, StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import {
  deleteEvaluationRun,
  getDashboardAttention,
  getDashboardStats,
  listEvaluationRuns,
  type AttentionItem,
  type DashboardStatsResponse,
  type EvaluationRunSummary,
} from "@/services/runs";
import { runDeleteDescription } from "@/lib/delete-copy";

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [runs, setRuns] = useState<EvaluationRunSummary[]>([]);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  // Gates the greeting summary: a failed fetch leaves attention empty, which
  // must not read as "all caught up".
  const [attentionLoaded, setAttentionLoaded] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<EvaluationRunSummary | null>(
    null
  );

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .finally(() => setStatsLoading(false));

    // A secondary panel: if it fails, the dashboard just renders without it.
    getDashboardAttention()
      .then((res) => {
        setAttention(res.items);
        setAttentionLoaded(true);
      })
      .catch(() => {});

    listEvaluationRuns(5)
      .then((res) => setRuns(res.items))
      .finally(() => setRunsLoading(false));
  }, []);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    await deleteEvaluationRun(id);
    setRuns((prev) => prev.filter((run) => run.id !== id));
    setAttention((prev) => prev.filter((item) => item.run_id !== id));
    // The stat tiles are computed server-side and fetched once on mount, so
    // dropping the row is not enough -- total_runs and total_candidates would
    // both stay stale until a remount.
    setStats(await getDashboardStats());
  };

  const firstName = user?.full_name?.split(" ")[0] ?? "there";
  const attentionRuns = new Set(attention.map((item) => item.run_id)).size;
  // A first-time user gets the onboarding steps instead of empty stats and an
  // empty table. Also true after deleting every run, which is the same state.
  const isNew = !runsLoading && runs.length === 0;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Greeting + the page's primary action */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {isNew ? `Welcome, ${firstName}` : `Welcome back, ${firstName}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 min-h-5">
            {isNew
              ? "Let's screen your first candidates."
              : attentionLoaded &&
                (attentionRuns === 0
                  ? "You're all caught up."
                  : attentionRuns === 1
                    ? "1 run needs your attention."
                    : `${attentionRuns} runs need your attention.`)}
          </p>
        </div>
        {/* Hidden while loading too, so a new user never sees it flash in
            next to the onboarding card's own button. */}
        {!runsLoading && !isNew && (
          <Button asChild className="gap-1.5">
            <Link href="/dashboard/new">
              <Plus className="w-4 h-4" />
              New evaluation
            </Link>
          </Button>
        )}
      </div>

      {isNew ? (
        <DashboardOnboarding />
      ) : (
        <>
          <StatStrip className="sm:grid-cols-2 xl:grid-cols-4">
            <StatCell
              icon={Layers}
              label="Total runs"
              value={stats ? String(stats.total_runs) : "—"}
              loading={statsLoading}
            />
            <StatCell
              icon={Users}
              label="Candidates"
              value={stats ? String(stats.total_candidates) : "—"}
              loading={statsLoading}
            />
            <StatCell
              icon={MessageSquareText}
              label="Interviews taken"
              value={stats ? String(stats.interviews_completed) : "—"}
              loading={statsLoading}
            />
            <StatCell
              icon={Clock}
              label="Last active"
              value={
                stats?.last_active != null
                  ? new Date(stats.last_active).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : "—"
              }
              // The year only earns its place when it isn't this one.
              suffix={
                stats?.last_active != null &&
                new Date(stats.last_active).getFullYear() !==
                  new Date().getFullYear()
                  ? String(new Date(stats.last_active).getFullYear())
                  : undefined
              }
              loading={statsLoading}
            />
          </StatStrip>

          {/* Two columns at xl when there is something needing attention, so the
              runs table stays above the fold; otherwise the table spans the row.
              Below xl it stacks with attention first. */}
          <div
            className={
              attention.length > 0
                ? "grid grid-cols-1 xl:grid-cols-3 gap-8 items-start"
                : undefined
            }
          >
            {attention.length > 0 && (
              <div className="xl:order-2">
                <DashboardAttention items={attention} />
              </div>
            )}

            {/* Recent runs */}
            <div className="xl:col-span-2 min-w-0">
              <div className="flex items-center justify-between min-h-8 mb-4">
                <h2 className="text-base font-semibold">Recent evaluations</h2>
                {runs.length > 0 && (
                  <Link
                    href="/history"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View all runs →
                  </Link>
                )}
              </div>

              {runsLoading ? (
                <Card>
                  <div className="p-4 space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                </Card>
              ) : (
                <RunsTable runs={runs} onDelete={setPendingDelete} />
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this evaluation run?"
        description={pendingDelete ? runDeleteDescription(pendingDelete) : null}
        confirmLabel="Delete run"
        onConfirm={handleDelete}
      />
    </div>
  );
}
