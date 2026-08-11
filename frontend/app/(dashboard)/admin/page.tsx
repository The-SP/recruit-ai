"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Gauge,
  Layers,
  MessageSquare,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/services/api";
import { getAdminStats, type AdminStatsResponse } from "@/services/admin";

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  loading: boolean;
  // "warn" flags an operational concern (e.g. circuit breaker tripped) with
  // destructive styling instead of the neutral primary treatment.
  tone?: "warn";
}) {
  const warn = tone === "warn";

  return (
    <Card className={warn ? "border-destructive/40" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            warn ? "bg-destructive/10" : "bg-primary/10"
          }`}
        >
          <Icon className={`w-4 h-4 ${warn ? "text-destructive" : "text-primary"}`} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <p className={`text-3xl font-bold ${warn ? "text-destructive" : ""}`}>
              {value}
            </p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

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

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-xl">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Admin Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Usage across every account.
          </p>
        </div>
      </div>

      {error && (
        <Card className="p-6 text-center text-destructive border-destructive/30 bg-destructive/5">
          {error}
        </Card>
      )}

      {!error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Users"
            value={stats ? String(stats.total_users) : "—"}
            hint={stats ? `${stats.new_users_7d} joined in the last 7 days` : undefined}
            loading={loading}
          />
          <StatCard
            icon={Layers}
            label="Runs"
            value={stats ? String(stats.total_runs) : "—"}
            hint={
              stats ? `${stats.runs_24h} in 24h · ${stats.runs_7d} in 7d` : undefined
            }
            loading={loading}
          />
          <StatCard
            icon={UserPlus}
            label="Resumes Scored"
            value={stats ? String(stats.total_candidates) : "—"}
            loading={loading}
          />
          <StatCard
            icon={Shield}
            label="Anonymous Runs"
            value={stats ? String(stats.anonymous_runs) : "—"}
            loading={loading}
          />
          <StatCard
            icon={Gauge}
            label="LLM Budget Today"
            value={
              stats ? `${stats.budget_units_used} / ${stats.budget_units_limit}` : "—"
            }
            hint={
              stats
                ? `${((stats.budget_units_used / (stats.budget_units_limit || 1)) * 100).toFixed(0)}% used, resets at UTC midnight`
                : undefined
            }
            loading={loading}
          />
          <StatCard
            icon={MessageSquare}
            label="Interviews Completed"
            value={stats ? String(stats.completed_interviews) : "—"}
            loading={loading}
          />
          <StatCard
            icon={Layers}
            label="Last Run"
            value={stats?.last_run_at ? timeAgo(stats.last_run_at) : "—"}
            loading={loading}
          />
          <StatCard
            icon={AlertTriangle}
            label="Circuit Breaker"
            value={stats ? (stats.circuit_breaker_active ? "TRIPPED" : "OK") : "—"}
            hint={
              stats?.circuit_breaker_active
                ? "Gemini rate limit hit -- make circuit-reset"
                : undefined
            }
            tone={stats?.circuit_breaker_active ? "warn" : undefined}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
}
