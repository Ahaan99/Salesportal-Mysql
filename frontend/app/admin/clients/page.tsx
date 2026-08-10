"use client";

import useSWR from "swr";
import { Building2, ShieldAlert } from "lucide-react";
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
import { ADMIN_CLIENTS_KEY, fetchAdminClients } from "@/lib/api/overview";
import { formatCompact } from "@/lib/utils";

export default function AdminClientsPage() {
  const { data, error, isLoading, mutate } = useSWR(
    ADMIN_CLIENTS_KEY,
    fetchAdminClients,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading clients">
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
            {error instanceof Error ? error.message : "Could not load clients."}
          </p>
          <Button variant="outline" onClick={() => mutate()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const clients = data.clients;
  const totalGmv = clients.reduce((s, c) => s + c.gmv, 0);
  const onboarding = clients.filter((c) => c.productsLive === 0).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 rounded-xl bg-ink p-6 text-ink-foreground md:flex-row md:items-center md:p-8">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Building2 className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-serif text-2xl tracking-tight">
              {clients.length} vendor {clients.length === 1 ? "partner" : "partners"}
            </h2>
            <p className="text-sm text-ink-muted">
              ₹{formatCompact(totalGmv)} combined GMV
              {onboarding > 0 ? ` · ${onboarding} currently onboarding` : ""}
            </p>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">All clients</CardTitle>
          <CardDescription>
            Vendors who launch and sell products through Recruweb
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {clients.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No clients have signed up yet.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Company</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Live products</th>
                  <th className="pb-3 pr-4 font-medium">Orders</th>
                  <th className="pb-3 pr-4 font-medium">GMV</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-3">
                        <Avatar seed={c.name} />
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Since{" "}
                            {new Date(c.joinedAt).toLocaleDateString("en-IN", {
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 text-muted-foreground">{c.email}</td>
                    <td className="py-3.5 pr-4">
                      {c.productsLive}
                      {c.productsTotal > c.productsLive ? (
                        <span className="text-xs text-muted-foreground">
                          {" "}/ {c.productsTotal}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3.5 pr-4">{c.orders.toLocaleString("en-IN")}</td>
                    <td className="py-3.5 pr-4 font-medium">
                      {c.gmv > 0 ? `₹${formatCompact(c.gmv)}` : "—"}
                    </td>
                    <td className="py-3.5">
                      <Badge variant={c.productsLive > 0 ? "success" : "warning"}>
                        {c.productsLive > 0 ? "active" : "onboarding"}
                      </Badge>
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
