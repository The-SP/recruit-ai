"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Clock,
  Gauge,
  Layers,
  MessageSquare,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";

import { StatCell, StatStrip } from "@/components/stat-strip";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";
import { getAdminStats, type AdminStatsResponse } from "@/services/admin";

// Coarse relative time (minutes/hours/days) rather than a library: the last-run
// card only needs "how stale is this", not calendar precision.
function timeAgo(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminStats()
      .then((s) => {
        if (cancelled) return;
        setStats(s);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load admin data.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const budgetPercent = stats
    ? Math.min(
        100,
        Math.round(
          (stats.budget_units_used / (stats.budget_units_limit || 1)) * 100
        )
      )
    : 0;
  const budgetExhausted =
    stats != null && stats.budget_units_used >= stats.budget_units_limit;
  const breakerTripped = stats?.circuit_breaker_active ?? false;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Usage across every account.
        </p>
      </div>

      {error && (
        <Card className="p-6 text-center text-destructive border-destructive/30 bg-destructive/5">
          {error}
        </Card>
      )}

      {!error && (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Usage</h2>
            <StatStrip className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatCell
                icon={Users}
                label="Users"
                value={stats ? String(stats.total_users) : "—"}
                hint={stats ? `+${stats.new_users_7d} in 7d` : undefined}
                loading={loading}
              />
              <StatCell
                icon={Layers}
                label="Runs"
                value={stats ? String(stats.total_runs) : "—"}
                hint={
                  stats ? `${stats.runs_24h} in 24h · ${stats.runs_7d} in 7d` : undefined
                }
                loading={loading}
              />
              <StatCell
                icon={UserPlus}
                label="Resumes scored"
                value={stats ? String(stats.total_candidates) : "—"}
                loading={loading}
              />
              <StatCell
                icon={Shield}
                label="Anonymous runs"
                value={stats ? String(stats.anonymous_runs) : "—"}
                loading={loading}
              />
              <StatCell
                icon={MessageSquare}
                label="Interviews"
                value={stats ? String(stats.completed_interviews) : "—"}
                hint="completed"
                loading={loading}
              />
              <StatCell
                icon={Clock}
                label="Last run"
                value={stats?.last_run_at ? timeAgo(stats.last_run_at) : "—"}
                loading={loading}
              />
            </StatStrip>
          </section>

          {/* Read-only on purpose: resetting either is make budget-reset /
              circuit-reset over SSH, never a button here. See admin.py. */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">System health</h2>
            <StatStrip className="sm:grid-cols-2">
              <StatCell
                icon={Gauge}
                label="LLM budget today"
                value={
                  stats
                    ? `${stats.budget_units_used} / ${stats.budget_units_limit}`
                    : "—"
                }
                tone={budgetExhausted ? "warn" : undefined}
                hint={
                  stats
                    ? `${budgetPercent}% used · resets at UTC midnight`
                    : undefined
                }
                loading={loading}
              >
                <Progress
                  value={budgetPercent}
                  className={cn(
                    "mt-2 h-1.5",
                    budgetExhausted && "[&>[data-slot=progress-indicator]]:bg-destructive"
                  )}
                />
              </StatCell>
              <StatCell
                icon={Activity}
                label="Circuit breaker"
                value={
                  stats ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          breakerTripped ? "bg-destructive" : "bg-primary"
                        )}
                      />
                      {breakerTripped ? "Tripped" : "OK"}
                    </span>
                  ) : (
                    "—"
                  )
                }
                tone={breakerTripped ? "warn" : undefined}
                hint={
                  breakerTripped
                    ? "Gemini rate limit hit. Reset with make circuit-reset."
                    : undefined
                }
                loading={loading}
              />
            </StatStrip>
          </section>
        </>
      )}
    </div>
  );
}
