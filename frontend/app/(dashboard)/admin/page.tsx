"use client";

import { useEffect, useState } from "react";
import { Layers, Search, Shield, UserPlus, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/services/api";
import {
  getAdminStats,
  listAllUsers,
  type AdminStatsResponse,
  type AdminUserRow,
} from "@/services/admin";

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
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
          <>
            <p className="text-3xl font-bold">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userTotal, setUserTotal] = useState(0);
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
    let cancelled = false;
    Promise.all([getAdminStats(), listAllUsers(100, 0, debouncedSearch || undefined)])
      .then(([s, u]) => {
        if (cancelled) return;
        setStats(s);
        setUsers(u.items);
        setUserTotal(u.total);
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
  }, [debouncedSearch]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-xl">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Admin Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deployment-wide usage across every account.
          </p>
        </div>
      </div>

      {error && (
        <Card className="p-6 text-center text-destructive border-destructive/30 bg-destructive/5">
          {error}
        </Card>
      )}

      {!error && (
        <>
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
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold">Users</h2>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            {loading ? (
              <Card className="p-6 space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </Card>
            ) : users.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="font-semibold text-muted-foreground">
                  No users match this search
                </p>
              </Card>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  Showing {users.length} of {userTotal}
                </p>
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead className="text-center">Runs</TableHead>
                          <TableHead>Last Run</TableHead>
                          <TableHead>Flags</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 shrink-0">
                                  <AvatarImage
                                    src={u.avatar_url ?? undefined}
                                    alt={u.full_name ?? u.email}
                                    referrerPolicy="no-referrer"
                                  />
                                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                                    {initials(u.full_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">
                                    {u.full_name ?? "—"}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {u.email}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {shortDate(u.created_at)}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {u.run_count}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {u.last_run_at ? shortDate(u.last_run_at) : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1.5">
                                {u.is_admin && <Badge variant="outline">Admin</Badge>}
                                {!u.is_active && (
                                  <Badge
                                    variant="outline"
                                    className="bg-error text-error-foreground border-error-edge"
                                  >
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
