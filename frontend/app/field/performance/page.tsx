"use client";

import { useState } from "react";
import useSWR from "swr";
import { AlertCircle, IndianRupee, Package, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/portal/stat-card";
import { MiniBars } from "@/components/portal/mini-bars";
import { apiFetcher } from "@/lib/api/client";
import { performanceKey, type PerformanceResponse, type PerfPoint } from "@/lib/api/field";
import { cn, formatINR } from "@/lib/utils";

type Range = "daily" | "monthly";
type Metric = "revenue" | "units" | "commission";

const METRICS: { value: Metric; label: string }[] = [
  { value: "revenue", label: "Sales value" },
  { value: "units", label: "Units sold" },
  { value: "commission", label: "Commission" },
];

function pointLabel(p: PerfPoint, range: Range) {
  if (range === "monthly") return (p.month ?? "").split(" ")[0];
  return p.day
    ? new Date(`${p.day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "";
}

export default function FieldPerformancePage() {
  const [range, setRange] = useState<Range>("daily");
  const [metric, setMetric] = useState<Metric>("revenue");

  const { data, error, isLoading } = useSWR<PerformanceResponse>(
    performanceKey(range, range === "daily" ? 14 : 6),
    apiFetcher,
    { keepPreviousData: true }
  );

  const points = data?.points ?? [];
  const totals = points.reduce(
    (acc, p) => ({
      revenue: acc.revenue + Number(p.revenue || 0),
      units: acc.units + Number(p.units || 0),
      orders: acc.orders + Number(p.orders || 0),
      commission: acc.commission + Number(p.commission || 0),
    }),
    { revenue: 0, units: 0, orders: 0, commission: 0 }
  );

  const bars = points.map((p) => ({
    label: pointLabel(p, range),
    value: Number(p[metric]) || 0,
  }));
  const hasData = bars.some((b) => b.value > 0);

  const periodLabel = range === "daily" ? "Last 14 days" : "Last 6 months";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="group" aria-label="Time range">
          {(["daily", "monthly"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs font-medium capitalize transition-colors",
                range === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={range === r}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Chart metric">
          {METRICS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMetric(m.value)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                metric === m.value
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={metric === m.value}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Sales value"
          value={formatINR(totals.revenue)}
          hint={periodLabel}
          icon={IndianRupee}
        />
        <StatCard
          index={1}
          label="Units sold"
          value={totals.units.toLocaleString("en-IN")}
          hint={periodLabel}
          icon={Target}
        />
        <StatCard
          index={2}
          label="Orders placed"
          value={totals.orders.toLocaleString("en-IN")}
          hint={periodLabel}
          icon={Package}
        />
        <StatCard
          index={3}
          label="Commission"
          value={formatINR(totals.commission)}
          hint={periodLabel}
          icon={IndianRupee}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            {METRICS.find((m) => m.value === metric)?.label}
          </CardTitle>
          <CardDescription>{periodLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex h-44 flex-col items-center justify-center gap-2 text-center">
              <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          ) : isLoading && !data ? (
            <div className="h-44 animate-pulse rounded-lg bg-secondary/60" />
          ) : hasData ? (
            <MiniBars data={bars} />
          ) : (
            <p className="flex h-44 items-center justify-center rounded-lg bg-secondary/60 px-4 text-center text-sm text-muted-foreground">
              No activity in this period yet — your chart fills in as you sell.
            </p>
          )}
        </CardContent>
      </Card>

      {points.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Performance breakdown by {range === "daily" ? "day" : "month"}</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">
                  {range === "daily" ? "Day" : "Month"}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Orders</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Units</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Sales</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Commission</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day ?? p.month} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    {range === "daily"
                      ? p.day
                        ? new Date(`${p.day}T00:00:00`).toLocaleDateString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })
                        : "—"
                      : p.month}
                  </td>
                  <td className="px-4 py-3 text-right">{p.orders}</td>
                  <td className="px-4 py-3 text-right">{p.units}</td>
                  <td className="px-4 py-3 text-right">{formatINR(Number(p.revenue))}</td>
                  <td className="px-4 py-3 text-right font-medium text-primary">
                    {formatINR(Number(p.commission))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
