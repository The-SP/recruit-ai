"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  ExternalLink,
  Layers,
  Plus,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import {
  getDashboardStats,
  listEvaluationRuns,
  type DashboardStatsResponse,
  type EvaluationRunSummary,
} from "@/services/runs";
import { statusLabels, statusStyles } from "@/lib/evaluation-styles";

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-3xl font-bold">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [runs, setRuns] = useState<EvaluationRunSummary[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .finally(() => setStatsLoading(false));

    listEvaluationRuns(5)
      .then((res) => setRuns(res.items))
      .finally(() => setRunsLoading(false));
  }, []);

  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {firstName}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Layers}
          label="Total Runs"
          value={stats ? String(stats.total_runs) : "—"}
          loading={statsLoading}
        />
        <StatCard
          icon={Users}
          label="Candidates Evaluated"
          value={stats ? String(stats.total_candidates) : "—"}
          loading={statsLoading}
        />
        <StatCard
          icon={Clock}
          label="Last Active"
          value={
            stats
              ? stats.last_active != null
                ? new Date(stats.last_active).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"
              : "—"
          }
          loading={statsLoading}
        />
      </div>

      {/* Recent runs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Evaluations</h2>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/dashboard/new">
              <Plus className="w-3.5 h-3.5" />
              New Evaluation
            </Link>
          </Button>
        </div>

        {runsLoading ? (
          <Card>
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </Card>
        ) : runs.length === 0 ? (
          <Card className="p-12 text-center">
            <Layers className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground">No evaluations yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create your first evaluation run to get started.
            </p>
            <Button asChild>
              <Link href="/dashboard/new">
                <Plus className="w-4 h-4 mr-1.5" />
                New Evaluation
              </Link>
            </Button>
          </Card>
        ) : (
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
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(run.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {run.job_title ?? (
                        <span className="text-muted-foreground italic">Untitled</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {run.company_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {run.total_count}
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
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/evaluation/${run.id}`}>
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

        {runs.length > 0 && (
          <div className="mt-3 text-right">
            <Link
              href="/history"
              className="text-sm text-primary hover:underline"
            >
              View all runs →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
