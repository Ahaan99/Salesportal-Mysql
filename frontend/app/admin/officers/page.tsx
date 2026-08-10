"use client";

import useSWR from "swr";
import { ShieldAlert, UsersRound } from "lucide-react";
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
import { ADMIN_OFFICERS_KEY, fetchAdminOfficers } from "@/lib/api/overview";
import { formatCompact, formatINR } from "@/lib/utils";

/** An officer is "active" if they closed a sale in the last 7 days. */
function activity(lastSaleAt: string | null): { label: string; variant: "success" | "accent" | "outline" } {
  if (!lastSaleAt) return { label: "No sales yet", variant: "outline" };
  const days = (Date.now() - new Date(lastSaleAt).getTime()) / 86400000;
  if (days <= 7) return { label: "Active", variant: "success" };
  if (days <= 30) return { label: "Recent", variant: "accent" };
  return { label: "Dormant", variant: "outline" };
}

export default function AdminOfficersPage() {
  const { data, error, isLoading, mutate } = useSWR(
    ADMIN_OFFICERS_KEY,
    fetchAdminOfficers,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading officers">
        <div className="h-28 animate-pulse rounded-xl bg-ink/90" />
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
            {error instanceof Error ? error.message : "Could not load officers."}
          </p>
          <Button variant="outline" onClick={() => mutate()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { officers, regions } = data;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 rounded-xl bg-ink p-6 text-ink-foreground md:flex-row md:items-center md:p-8">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <UsersRound className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-serif text-2xl tracking-tight">
              {officers.length} {officers.length === 1 ? "officer" : "officers"} on the ground
            </h2>
            <p className="text-sm text-ink-muted">
              {regions.length > 0
                ? `Across ${regions.length} ${regions.length === 1 ? "region" : "regions"} · anyone can join from any location`
                : "Anyone can join from any location"}
            </p>
          </div>
        </div>
        {regions.length > 0 && (
          <div className="flex flex-wrap gap-6">
            {regions.map((r) => (
              <div key={r.region} className="text-center">
                <p className="font-serif text-2xl">{r.officers}</p>
                <p className="text-xs uppercase tracking-widest text-ink-muted">{r.region}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Field force</CardTitle>
          <CardDescription>Ranked by verified sales value this month</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {officers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No field officers have signed up yet.
            </p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Rank</th>
                  <th className="pb-3 pr-4 font-medium">Officer</th>
                  <th className="pb-3 pr-4 font-medium">Location</th>
                  <th className="pb-3 pr-4 font-medium">Sales (month)</th>
                  <th className="pb-3 pr-4 font-medium">Units</th>
                  <th className="pb-3 pr-4 font-medium">Commission due</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {officers.map((o, i) => {
                  const act = activity(o.lastSaleAt);
                  return (
                    <tr key={o.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3.5 pr-4">
                        <span
                          className={
                            i === 0
                              ? "font-serif text-xl text-accent"
                              : "font-serif text-xl text-muted-foreground/50"
                          }
                        >
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-3">
                          <Avatar seed={o.name} online={act.variant === "success"} />
                          <div>
                            <p className="font-medium">{o.name}</p>
                            <p className="text-xs text-muted-foreground">{o.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-muted-foreground">
                        {[o.city, o.region].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-3.5 pr-4 font-medium">
                        {o.salesMonth > 0 ? formatINR(o.salesMonth) : "—"}
                      </td>
                      <td className="py-3.5 pr-4">
                        {o.unitsMonth.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3.5 pr-4">
                        {o.commissionPending > 0
                          ? `₹${formatCompact(o.commissionPending)}`
                          : "—"}
                      </td>
                      <td className="py-3.5">
                        <Badge variant={act.variant}>{act.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
