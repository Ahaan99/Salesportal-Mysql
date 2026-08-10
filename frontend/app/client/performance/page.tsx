"use client";

import useSWR from "swr";
import { IndianRupee, Route, ShieldAlert, Trophy, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
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
import { CLIENT_OVERVIEW_KEY, fetchClientOverview } from "@/lib/api/overview";
import { formatINR } from "@/lib/utils";

export default function FieldPerformancePage() {
  const { data, error, isLoading, mutate } = useSWR(
    CLIENT_OVERVIEW_KEY,
    fetchClientOverview,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading field performance">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Could not load field performance."}
          </p>
          <Button variant="outline" onClick={() => mutate()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { field } = data;
  const avgOrderValue =
    field.officers.reduce((s, o) => s + o.orders, 0) > 0
      ? field.revenue / field.officers.reduce((s, o) => s + o.orders, 0)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="Field revenue (year)" value={formatINR(field.revenue)} icon={IndianRupee} />
        <StatCard index={1} label="Units sold via field" value={field.units.toLocaleString("en-IN")} icon={Route} />
        <StatCard index={2} label="Officers on your products" value={String(field.officers.length)} icon={Users} />
        <StatCard index={3} label="Avg field order value" value={avgOrderValue > 0 ? formatINR(Math.round(avgOrderValue)) : "—"} hint="Across verified field orders" icon={Trophy} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Officer leaderboard</CardTitle>
            <CardDescription>Ranked by verified sales of your products</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {field.officers.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No field sales yet — officers who sell your products will rank here.
              </p>
            ) : (
              field.officers.map((o) => (
                <div key={o.name} className="flex items-center gap-4">
                  <span className="w-5 text-center font-serif text-xl text-primary/40">
                    {o.rank}
                  </span>
                  <Avatar seed={o.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.orders} {o.orders === 1 ? "order" : "orders"} closed
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatINR(o.sales)}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.units.toLocaleString("en-IN")} units
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif text-xl">How field sales work</CardTitle>
            <CardDescription>From doorstep to verified order</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
            <p>
              Field sales officers sell your products in person. Every sale they
              submit is verified by the Recruweb admin team before it becomes an
              order here.
            </p>
            <p>
              Only <Badge variant="success">verified</Badge> sales are counted in
              this report — rejected or on-hold submissions never touch your
              numbers.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Recent field orders</CardTitle>
          <CardDescription>Orders closed in person by field sales officers</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {field.recentOrders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No field orders yet.
            </p>
          ) : (
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Order</th>
                  <th className="pb-3 pr-4 font-medium">Product</th>
                  <th className="pb-3 pr-4 font-medium">Buyer</th>
                  <th className="pb-3 pr-4 font-medium">Officer</th>
                  <th className="pb-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {field.recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3.5 pr-4 font-medium">{o.order_no}</td>
                    <td className="max-w-[220px] truncate py-3.5 pr-4 text-muted-foreground">
                      {o.product_name}
                    </td>
                    <td className="py-3.5 pr-4">
                      {o.customer_name}
                      {o.city ? (
                        <span className="block text-xs text-muted-foreground">{o.city}</span>
                      ) : null}
                    </td>
                    <td className="py-3.5 pr-4 text-muted-foreground">
                      {o.officer_name ?? "—"}
                    </td>
                    <td className="py-3.5 font-medium">{formatINR(o.amount)}</td>
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
