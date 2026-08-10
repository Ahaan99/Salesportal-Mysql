"use client";

import useSWR from "swr";
import { motion } from "framer-motion";
import {
  BarChart3,
  BadgeIndianRupee,
  ShieldCheck,
  TrendingUp,
  Users,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ADMIN_SUMMARY_KEY,
  ADMIN_SALES_TREND_KEY,
  ADMIN_TOP_OFFICERS_KEY,
  ADMIN_KYC_STATS_KEY,
  fetchAdminSummary,
  fetchAdminSalesTrend,
  fetchAdminTopOfficers,
  fetchAdminKycStats,
  type AdminSummary,
  type SalesTrend,
  type TopOfficersResponse,
  type KycStats,
} from "@/lib/api/reports";
import { formatINR } from "@/lib/utils";

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string; icon: typeof BarChart3; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-0.5 font-serif text-2xl font-semibold tracking-tight">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SalesTrendChart({ data }: { data: SalesTrend }) {
  const max = Math.max(...data.trend.map(p => p.value), 1);
  // Show last 14 points for readability
  const points = data.trend.slice(-14);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-0.5 h-32">
        {points.map((p, i) => {
          const pct = max > 0 ? (p.value / max) * 100 : 0;
          return (
            <div key={p.date} className="relative flex-1 flex flex-col items-center justify-end group">
              <div
                className="w-full rounded-t-sm bg-primary/70 group-hover:bg-primary transition-all duration-200"
                style={{ height: `${Math.max(pct, 2)}%` }}
                title={`${p.date}: ${formatINR(p.value)}`}
              />
              {i % 4 === 0 && (
                <span className="absolute -bottom-5 text-[9px] text-muted-foreground rotate-[-30deg] origin-top-left whitespace-nowrap">
                  {p.date.slice(5)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 text-xs text-muted-foreground text-right">
        Max: {formatINR(max)} — Last 14 days
      </div>
    </div>
  );
}

const KYC_STATUS_COLORS: Record<string, string> = {
  draft:    "bg-muted",
  pending:  "bg-amber-400",
  approved: "bg-green-500",
  rejected: "bg-red-500",
};

export default function AdminReportsPage() {
  const TREND_DAYS = 30;

  const { data: summary, isLoading: l1, error: e1 } = useSWR<AdminSummary>(ADMIN_SUMMARY_KEY, fetchAdminSummary);
  const { data: trend,   isLoading: l2, error: e2 } = useSWR<SalesTrend>(ADMIN_SALES_TREND_KEY(TREND_DAYS), fetchAdminSalesTrend);
  const { data: officers, isLoading: l3, error: e3 } = useSWR<TopOfficersResponse>(ADMIN_TOP_OFFICERS_KEY, fetchAdminTopOfficers);
  const { data: kycStats, isLoading: l4, error: e4 } = useSWR<KycStats>(ADMIN_KYC_STATS_KEY, fetchAdminKycStats);

  const isLoading = l1 || l2 || l3 || l4;
  const hasError  = e1 || e2 || e3 || e4;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <section className="flex flex-col gap-3 rounded-xl bg-ink p-6 text-ink-foreground md:p-8">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <BarChart3 className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-serif text-2xl tracking-tight">Reports & Analytics</h2>
            <p className="text-sm text-ink-muted">Platform-wide performance metrics and operational insights</p>
          </div>
        </div>
      </section>

      {hasError && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          Some data could not be loaded. Please refresh to try again.
        </div>
      )}

      {/* KPI Summary */}
      <div>
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">Platform KPIs</h3>
        {l1 ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
              <StatCard label="Total GMV" value={formatINR(summary?.gmv ?? 0)} icon={BadgeIndianRupee} sub="All non-cancelled orders" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
              <StatCard label="Field Sales GMV" value={formatINR(summary?.salesGmv ?? 0)} icon={TrendingUp} sub="Approved sales submissions" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              <StatCard label="Total Orders" value={String(summary?.totalOrders ?? 0)} icon={BarChart3} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
              <StatCard
                label="KYC Pending"
                value={String(summary?.kycCounts.pending ?? 0)}
                icon={ShieldCheck}
                sub={`${summary?.kycCounts.approved ?? 0} approved total`}
              />
            </motion.div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Sales Trend</CardTitle>
            <CardDescription>Approved field sales GMV — last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {l2 ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading trend…
              </div>
            ) : trend ? (
              <SalesTrendChart data={trend} />
            ) : null}
          </CardContent>
        </Card>

        {/* KYC Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">KYC Status Breakdown</CardTitle>
            <CardDescription>Submissions by status and role</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {l4 ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : kycStats ? (
              <>
                {/* Status bars */}
                <div className="flex flex-col gap-2">
                  {(Object.entries(kycStats.byStatus) as [string, number][]).map(([status, count]) => {
                    const pct = kycStats.total > 0 ? (count / kycStats.total) * 100 : 0;
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span className="w-20 text-xs capitalize text-muted-foreground">{status}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${KYC_STATUS_COLORS[status] ?? "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-sm font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
                {/* By role */}
                <div className="flex gap-4 border-t border-border pt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Field Officers</p>
                    <p className="font-serif text-xl">{kycStats.byRole.field}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Vendors</p>
                    <p className="font-serif text-xl">{kycStats.byRole.client}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">New this fortnight</p>
                    <p className="font-serif text-xl">{kycStats.recentPending}</p>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Top Officers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Top Field Officers</CardTitle>
          <CardDescription>Ranked by approved sales GMV — all time</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {l3 ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading officers…
            </div>
          ) : officers && officers.officers.length > 0 ? (
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Rank</th>
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Location</th>
                  <th className="pb-3 pr-4 font-medium">Sales GMV</th>
                  <th className="pb-3 font-medium">Orders</th>
                </tr>
              </thead>
              <tbody>
                {officers.officers.map((o, i) => (
                  <tr key={o.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3.5 pr-4">
                      <span className={`font-serif text-xl ${i === 0 ? "text-accent" : "text-muted-foreground/40"}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 font-medium">{o.name}</td>
                    <td className="py-3.5 pr-4 text-muted-foreground">{o.city || "—"}</td>
                    <td className="py-3.5 pr-4 font-medium">{formatINR(o.sales)}</td>
                    <td className="py-3.5">{o.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No sales data yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
