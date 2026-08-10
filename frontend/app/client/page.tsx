"use client";

import useSWR from "swr";
import Link from "next/link";
import {
  ArrowUpRight,
  IndianRupee,
  Package,
  ShieldAlert,
  ShoppingCart,
  Timer,
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
  CLIENT_OVERVIEW_KEY,
  fetchClientOverview,
  type OverviewOrder,
} from "@/lib/api/overview";
import { formatINR } from "@/lib/utils";

const orderBadge: Record<OverviewOrder["status"], "success" | "accent" | "outline" | "destructive"> = {
  delivered: "success",
  "in-transit": "accent",
  processing: "outline",
  returned: "destructive",
  cancelled: "destructive",
};

export default function ClientDashboard() {
  const { data, error, isLoading, mutate } = useSWR(
    CLIENT_OVERVIEW_KEY,
    fetchClientOverview,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
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
        <div className="h-72 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Could not load your dashboard."}
          </p>
          <Button variant="outline" onClick={() => mutate()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { kpis, trend, topProducts, recentOrders } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="Revenue this month" value={formatINR(kpis.revenueMonth)} change={kpis.revenueGrowth} icon={IndianRupee} />
        <StatCard index={1} label="Units sold this month" value={kpis.unitsMonth.toLocaleString("en-IN")} change={kpis.unitsGrowth} icon={ShoppingCart} />
        <StatCard index={2} label="Live products" value={String(kpis.liveProducts)} hint={`${kpis.totalProducts} total in catalogue`} icon={Package} />
        <StatCard index={3} label="Orders in progress" value={String(kpis.pendingOrders)} hint="Processing or in transit" icon={Timer} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Revenue trend</CardTitle>
            <CardDescription>Monthly revenue in ₹ thousands, this year</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.every((t) => t.value === 0) ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No revenue recorded yet this year.
              </p>
            ) : (
              <MiniBars data={trend} suffix="k" />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="font-serif text-xl">Bestsellers</CardTitle>
            <Link
              href="/client/products"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              All products <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {topProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sales will rank your products here.
              </p>
            ) : (
              topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="font-serif text-2xl text-primary/30">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.units.toLocaleString("en-IN")} units sold
                    </p>
                  </div>
                  <span className="text-sm font-medium">{formatINR(p.revenue)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="font-serif text-xl">Recent orders</CardTitle>
          <Link
            href="/client/orders"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {recentOrders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No orders yet — they will appear as soon as your products sell.
            </p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Order</th>
                  <th className="pb-3 pr-4 font-medium">Product</th>
                  <th className="pb-3 pr-4 font-medium">Channel</th>
                  <th className="pb-3 pr-4 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3.5 pr-4 font-medium">{o.order_no}</td>
                    <td className="max-w-[220px] truncate py-3.5 pr-4 text-muted-foreground">
                      {o.product_name}
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
