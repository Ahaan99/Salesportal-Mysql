"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertCircle, ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiFetcher } from "@/lib/api/client";
import { ordersKey, type FieldOrder, type OrdersResponse } from "@/lib/api/field";
import { cn, formatINR } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "processing", label: "Processing" },
  { value: "packed", label: "Packed" },
  { value: "in-transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
] as const;

const STATUS_BADGE: Record<FieldOrder["status"], "default" | "accent" | "outline" | "destructive"> = {
  processing: "outline",
  packed: "accent",
  "in-transit": "accent",
  delivered: "default",
  cancelled: "destructive",
  returned: "destructive",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function FieldOrdersPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, error, isLoading } = useSWR<OrdersResponse>(
    ordersKey({ status, page }),
    apiFetcher,
    { keepPreviousData: true }
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setStatus(f.value);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              status === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={status === f.value}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
          <p className="text-sm font-medium">Could not load your orders.</p>
          <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
        </div>
      ) : isLoading && !data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : data && data.orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <PackageSearch className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">
            {status ? `No ${status.replace("-", " ")} orders.` : "You haven't placed any orders yet."}
          </p>
          {!status && (
            <Link href="/field/sell" className={cn(buttonVariants({ variant: "accent", size: "sm" }))}>
              Sell your first order
            </Link>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {data?.total.toLocaleString("en-IN")} order{data?.total === 1 ? "" : "s"}
            {status ? ` · ${status.replace("-", " ")}` : ""}
          </p>
          <ul className="flex flex-col gap-3">
            {data?.orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="font-mono text-xs text-muted-foreground">{o.order_no}</span>
                    <Badge variant={STATUS_BADGE[o.status]}>{o.status.replace("-", " ")}</Badge>
                  </p>
                  <p className="mt-1 truncate text-sm">
                    {o.product_name} × {o.qty}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.customer_name}
                    {o.city ? ` · ${o.city}` : ""}
                    {o.state ? `, ${o.state}` : ""} · {formatDate(o.placed_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-1">
                  <span className="font-serif text-xl">{formatINR(o.amount)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatINR(o.unit_price)} / unit
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Order pages">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
