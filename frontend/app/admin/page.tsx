"use client";

import useSWR from "swr";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  IndianRupee,
  PackageSearch,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/portal/stat-card";
import { MiniBars } from "@/components/portal/mini-bars";
import {
  ADMIN_OVERVIEW_KEY,
  fetchAdminOverview,
  type OverviewOrder,
} from "@/lib/api/overview";
import { formatCompact, formatINR } from "@/lib/utils";

const orderBadge: Record<OverviewOrder["status"], "success" | "accent" | "outline" | "destructive"> = {
  delivered: "success",
  "in-transit": "accent",
  processing: "outline",
  returned: "destructive",
  cancelled: "destructive",
};

function Skeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="h-72 animate-pulse rounded-xl border border-border bg-card lg:col-span-3" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-card lg:col-span-2" />
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

export default function AdminDashboard() {
  const { data, error, isLoading, mutate } = useSWR(
    ADMIN_OVERVIEW_KEY,
    fetchAdminOverview,
    { revalidateOnFocus: false }
  );

  if (isLoading) return <Skeleton />;

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Could not load the dashboard."}
          </p>
          <Button variant="outline" onClick={() => mutate()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { kpis, trend, regions, recentOrders } = data;
  const maxRegion = Math.max(1, ...regions.map((r) => r.sales));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="Company GMV" value={`₹${formatCompact(kpis.gmv)}`} change={kpis.gmvGrowth} icon={IndianRupee} />
        <StatCard index={1} label="Field officers" value={String(kpis.activeOfficers)} hint={`${kpis.ordersToday} orders today`} icon={UsersRound} />
        <StatCard index={2} label="Live clients" value={String(kpis.liveClients)} hint={`${kpis.productsLive} live products`} icon={Building2} />
        <StatCard index={3} label="Products in review" value={String(kpis.productsReview)} hint={`₹${formatCompact(kpis.commissionsPending)} commission pending`} icon={PackageSearch} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Platform revenue</CardTitle>
            <CardDescription>Monthly GMV in ₹ lakhs — all channels</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No revenue recorded yet.
              </p>
            ) : (
              <MiniBars
                data={trend.map((t) => ({
                  label: t.month.split(" ")[0],
                  value: Math.round(t.revenue / 100000),
                }))}
                suffix="L"
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Regional pulse</CardTitle>
            <CardDescription>Field sales by region this month</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {regions.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No regional sales yet.
              </p>
            )}
            {regions.map((r) => (
              <div key={r.region} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.region}</span>
                  <span className="text-muted-foreground">
                    {formatINR(r.sales)} · {r.officers} {r.officers === 1 ? "officer" : "officers"}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-secondary"
                  role="progressbar"
                  aria-valuenow={Math.round((r.sales / maxRegion) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${r.region} region sales share`}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(r.sales / maxRegion) * 100}%` }}
                  />
                </div>
                <p className={r.growth >= 0 ? "text-xs text-primary" : "text-xs text-destructive"}>
                  {r.growth >= 0 ? "+" : ""}{r.growth}% growth MoM
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="font-serif text-xl">Order stream</CardTitle>
            <CardDescription>Latest orders across every client and channel</CardDescription>
          </div>
          <Link
            href="/admin/clients"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Manage clients <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {recentOrders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No orders yet — approved field sales will appear here.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Order</th>
                  <th className="pb-3 pr-4 font-medium">Product</th>
                  <th className="pb-3 pr-4 font-medium">Buyer</th>
                  <th className="pb-3 pr-4 font-medium">Channel</th>
                  <th className="pb-3 pr-4 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3.5 pr-4 font-medium">{o.order_no}</td>
                    <td className="max-w-[200px] truncate py-3.5 pr-4 text-muted-foreground">
                      {o.product_name}
                    </td>
                    <td className="py-3.5 pr-4 text-muted-foreground">
                      {o.customer_name}
                      {o.city ? ` · ${o.city}` : ""}
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge variant={o.channel === "field" ? "accent" : "outline"}>
                        {o.channel === "field"
                          ? `Field${o.officer_name ? ` · ${o.officer_name}` : ""}`
                          : "Online"}
                      </Badge>
                    </td>
                    <td className="py-3.5 pr-4 font-medium">{formatINR(o.amount)}</td>
                    <td className="py-3.5">
                      <Badge variant={orderBadge[o.status] ?? "outline"}>{o.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
