"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BadgeIndianRupee,
  BarChart3,
  Loader2,
  Medal,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  FIELD_REPORTS_KEY,
  fetchFieldReports,
  type FieldReports,
  type SalesTrendPoint,
} from "@/lib/api/reports";
import { formatINR } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { label: "7 days",  value: 7  },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof BarChart3 }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-0.5 font-serif text-2xl font-semibold">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniTrendChart({ points }: { points: SalesTrendPoint[] }) {
  const max = Math.max(...points.map(p => p.value), 1);
  const last14 = points.slice(-14);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-0.5 h-28">
        {last14.map((p, i) => {
          const pct = (p.value / max) * 100;
          return (
            <div key={p.date} className="relative flex-1 flex flex-col items-center justify-end group">
              <div
                className="w-full rounded-t-sm bg-primary/70 group-hover:bg-primary transition-all"
                style={{ height: `${Math.max(pct, 2)}%` }}
                title={`${p.date}: ${formatINR(p.value)}`}
              />
              {i % 4 === 0 && (
                <span className="absolute -bottom-4 text-[9px] text-muted-foreground">
                  {p.date.slice(8)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-right text-xs text-muted-foreground">Last 14 days shown</p>
    </div>
  );
}

export default function FieldReportsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useSWR<FieldReports>(FIELD_REPORTS_KEY(days), fetchFieldReports);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <section className="flex flex-col gap-3 rounded-xl bg-ink p-6 text-ink-foreground md:flex-row md:items-center md:justify-between md:p-8">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <TrendingUp className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-serif text-2xl tracking-tight">My Reports</h2>
            <p className="text-sm text-ink-muted">Your personal sales & earnings analytics</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 rounded-lg border border-ink-muted/20 bg-ink-soft/40 p-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                days === opt.value
                  ? "bg-ink-foreground/10 text-ink-foreground"
                  : "text-ink-muted hover:text-ink-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          Could not load your reports. Please refresh.
        </div>
      )}

      {/* KPI Cards */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading your stats…
        </div>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Sales GMV",
              value: formatINR(data.totalSales),
              sub: `${data.salesCount} total submissions`,
              icon: TrendingUp,
            },
            {
              label: "Pending Sales",
              value: String(data.pendingSales),
              sub: "Awaiting admin review",
              icon: BarChart3,
            },
            {
              label: "Total Earnings",
              value: formatINR(data.totalEarnings),
              sub: `${formatINR(data.pendingEarnings)} pending`,
              icon: BadgeIndianRupee,
            },
            {
              label: "Your Rank",
              value: data.rank ? `#${data.rank}` : "—",
              sub: data.totalOfficers > 0 ? `Among ${data.totalOfficers} officers` : "No data yet",
              icon: Medal,
            },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <StatCard {...card} />
            </motion.div>
          ))}
        </div>
      ) : null}

      {/* Sales Trend Chart */}
      {data && data.trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Sales Trend</CardTitle>
            <CardDescription>Your approved sales GMV — last {days} days</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniTrendChart points={data.trend} />
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && data && data.salesCount === 0 && (
        <Card className="border-2 border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No sales data in this period</p>
            <p className="text-sm text-muted-foreground/70">
              Your sales reports will appear here once you have approved submissions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
