"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Coins, ExternalLink, Gauge, Hash, Timer } from "lucide-react";

import { StatCell, StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/services/api";
import {
  getLlmUsage,
  type LlmUsageResponse,
  type LlmUsageStats,
} from "@/services/admin";

const RANGES = [7, 14, 30] as const;

type Metric = "calls" | "tokens" | "cost";

const METRICS: { value: Metric; label: string }[] = [
  { value: "calls", label: "Calls" },
  { value: "tokens", label: "Tokens" },
  { value: "cost", label: "Cost" },
];

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCost(value: number | null): string {
  if (value == null) return "—";
  // Daily spend here is cents, so two decimals would read as $0.00.
  return `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

function formatSeconds(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}s`;
}

function metricValue(stats: LlmUsageStats, metric: Metric): number {
  if (metric === "calls") return stats.calls;
  if (metric === "tokens") return stats.prompt_tokens + stats.completion_tokens;
  return stats.cost ?? 0;
}

function formatMetric(value: number, metric: Metric): string {
  return metric === "cost" ? formatCost(value) : compact.format(value);
}

// Days are UTC calendar days (the same day the LLM budget resets on), so
// format them in UTC or the labels shift by one west of Greenwich.
function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const chartConfig = {
  value: { label: "Value", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function AdminLlmUsagePage() {
  const [days, setDays] = useState<number>(7);
  const [metric, setMetric] = useState<Metric>("calls");
  const [usage, setUsage] = useState<LlmUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLlmUsage(days)
      .then((u) => {
        if (cancelled) return;
        setUsage(u);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load LLM usage.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  // Loading is raised here rather than in the effect so changing the range
  // never sets state synchronously inside an effect.
  function changeRange(value: string) {
    setLoading(true);
    setDays(Number(value));
  }

  const totals = usage?.totals ?? null;
  const notConfigured = usage != null && !usage.configured;
  const chartData =
    usage?.daily.map((d) => ({
      day: d.day,
      value: metricValue(d.stats, metric),
    })) ?? [];
  const errorRate =
    totals && totals.calls > 0 ? (totals.errors / totals.calls) * 100 : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">LLM usage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Provider calls traced in LangSmith.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={String(days)} onValueChange={changeRange}>
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r} value={String(r)}>
                  {r}d
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {usage?.project_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={usage.project_url} target="_blank" rel="noreferrer">
                Open in LangSmith
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Card className="p-6 text-center text-destructive border-destructive/30 bg-destructive/5">
          {error}
        </Card>
      )}

      {notConfigured && (
        <Card className="p-6 gap-2">
          <p className="font-medium">LangSmith isn&apos;t configured</p>
          <p className="text-sm text-muted-foreground">
            Set <code>LANGSMITH_API_KEY</code> and{" "}
            <code>LANGSMITH_TRACING=true</code> on the backend. Calls made
            before tracing was on won&apos;t appear.
          </p>
        </Card>
      )}

      {!error && !notConfigured && (
        <>
          <StatStrip className="sm:grid-cols-2 xl:grid-cols-4">
            <StatCell
              icon={Hash}
              label="Calls"
              value={totals ? compact.format(totals.calls) : "—"}
              hint={
                totals
                  ? `${totals.errors} failed (${errorRate.toFixed(1)}%)`
                  : undefined
              }
              tone={errorRate >= 5 ? "warn" : undefined}
              loading={loading}
            />
            <StatCell
              icon={Gauge}
              label="Tokens"
              value={
                totals
                  ? compact.format(
                      totals.prompt_tokens + totals.completion_tokens,
                    )
                  : "—"
              }
              hint={
                totals
                  ? `${compact.format(totals.prompt_tokens)} in · ${compact.format(totals.completion_tokens)} out`
                  : undefined
              }
              loading={loading}
            />
            <StatCell
              icon={Coins}
              label="Estimated cost"
              value={totals ? formatCost(totals.cost) : "—"}
              hint={
                totals && totals.unpriced_calls > 0
                  ? `${totals.unpriced_calls} calls have no price in LangSmith`
                  : undefined
              }
              tooltip="LangSmith's estimate from its model price table, not your provider bill."
              loading={loading}
            />
            <StatCell
              icon={Timer}
              label="Latency p50"
              value={totals ? formatSeconds(totals.latency_p50) : "—"}
              hint={
                totals ? `p99 ${formatSeconds(totals.latency_p99)}` : undefined
              }
              loading={loading}
            />
          </StatStrip>

          <Card className="p-5 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Per day</h2>
              <Tabs
                value={metric}
                onValueChange={(v) => setMetric(v as Metric)}
              >
                <TabsList>
                  {METRICS.map((m) => (
                    <TabsTrigger key={m.value} value={m.value}>
                      {m.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={16}
                    tickFormatter={dayLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    allowDecimals={metric === "cost"}
                    tickFormatter={(v: number) => formatMetric(v, metric)}
                  />
                  <ChartTooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={
                      <ChartTooltipContent
                        hideIndicator
                        labelFormatter={(_, payload) =>
                          dayLabel(String(payload?.[0]?.payload?.day ?? ""))
                        }
                        formatter={(value) => (
                          <span className="font-mono tabular-nums text-foreground">
                            {formatMetric(Number(value), metric)}{" "}
                            <span className="text-muted-foreground">
                              {METRICS.find((m) => m.value === metric)?.label.toLowerCase()}
                            </span>
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar
                    dataKey="value"
                    fill="var(--color-value)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ChartContainer>
            )}
            {metric === "cost" && totals && totals.unpriced_calls > 0 && (
              <p className="text-xs text-muted-foreground">
                Excludes {totals.unpriced_calls} unpriced calls. Add their model
                prices in LangSmith to include them.
              </p>
            )}
          </Card>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">By model</h2>
            <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
              <div className="overflow-x-auto">
                <Table className="[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4">
                  <TableHeader>
                    <TableRow className="bg-foreground/[0.06] hover:bg-foreground/[0.06] border-b-2 border-foreground/15">
                      <TableHead>Model</TableHead>
                      <TableHead className="text-center">Calls</TableHead>
                      <TableHead className="text-center">Failed</TableHead>
                      <TableHead className="text-center">Tokens in</TableHead>
                      <TableHead className="text-center">Tokens out</TableHead>
                      <TableHead className="text-center">Cost</TableHead>
                      <TableHead className="text-center">p50</TableHead>
                      <TableHead className="text-center">p99</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:border-foreground/10 [&_td]:py-3">
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={8}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : usage && usage.by_model.length > 0 ? (
                      usage.by_model.map(({ model, stats }) => (
                        <TableRow key={model}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {model}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {stats.calls}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {stats.errors || "—"}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {compact.format(stats.prompt_tokens)}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {compact.format(stats.completion_tokens)}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums whitespace-nowrap">
                            {stats.cost == null && stats.unpriced_calls > 0 ? (
                              <span className="text-muted-foreground">No price</span>
                            ) : (
                              formatCost(stats.cost)
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                            {formatSeconds(stats.latency_p50)}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                            {formatSeconds(stats.latency_p99)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-muted-foreground py-8"
                        >
                          No LLM calls in this range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </section>

          {usage?.fetched_at && !loading && (
            <p className="text-xs text-muted-foreground">
              {usage.truncated && "Run cap reached, so these numbers are a lower bound. "}
              Project {usage.project_name}. Fetched{" "}
              {new Date(usage.fetched_at).toLocaleTimeString()} and cached for 5
              minutes.
            </p>
          )}
        </>
      )}
    </div>
  );
}
