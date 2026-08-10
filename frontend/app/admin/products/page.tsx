"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackageSearch,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  ADMIN_PRODUCT_COUNTS_KEY,
  adminProductsKey,
  approveProduct,
  rejectProduct,
  type AdminProduct,
  type AdminProductCountsResponse,
  type AdminProductsResponse,
  type ReviewableStatus,
} from "@/lib/api/admin";
import { cn, formatINR } from "@/lib/utils";

const TABS: { value: ReviewableStatus; label: string }[] = [
  { value: "review", label: "Awaiting review" },
  { value: "live", label: "Live" },
  { value: "rejected", label: "Rejected" },
];

const statusBadge: Record<string, "accent" | "success" | "destructive" | "outline"> = {
  review: "accent",
  live: "success",
  rejected: "destructive",
};

export default function AdminProductsPage() {
  const [tab, setTab] = useState<ReviewableStatus>("review");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [rejecting, setRejecting] = useState<AdminProduct | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const decidingRef = useRef(false);

  const { data, error, isLoading, mutate } = useSWR<AdminProductsResponse>(
    adminProductsKey(tab, page, search),
    apiFetcher,
    { keepPreviousData: true }
  );
  const { data: countsData, mutate: mutateCounts } = useSWR<AdminProductCountsResponse>(
    ADMIN_PRODUCT_COUNTS_KEY,
    apiFetcher
  );

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 12;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const counts = countsData?.counts;

  function switchTab(next: ReviewableStatus) {
    setTab(next);
    setPage(1);
    setActionError(null);
  }

  async function decide(product: AdminProduct, action: "approve" | "reject") {
    // Refs are synchronous, so even two clicks in the same tick can't both pass.
    if (decidingRef.current) return;
    decidingRef.current = true;
    setBusyId(product.id);
    setActionError(null);
    try {
      if (action === "approve") await approveProduct(product.id);
      else await rejectProduct(product.id, reason.trim());
      setRejecting(null);
      setReason("");
      await Promise.all([mutate(), mutateCounts()]);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not save the review decision.";
      setActionError(message);
      // 409 = someone else already decided it — refresh so the row disappears.
      if (err instanceof ApiError && err.status === 409) {
        // Nothing left to decide - close the dialog and return to the list.
        setRejecting(null);
        setReason("");
        await Promise.all([mutate(), mutateCounts()]);
      }
    } finally {
      decidingRef.current = false;
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter by review status" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => switchTab(t.value)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                tab === t.value
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              )}
            >
              {t.label}
              {counts && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-bold",
                    tab === t.value
                      ? "bg-primary-foreground/20"
                      : "bg-secondary text-foreground"
                  )}
                >
                  {counts[t.value].toLocaleString("en-IN")}
                </span>
              )}
            </button>
          ))}
        </div>

        <form
          className="relative w-full max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
            setPage(1);
          }}
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, brand or SKU"
            className="pl-9"
            aria-label="Search products"
          />
        </form>
      </div>

      {actionError && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {actionError}
        </p>
      )}

      {isLoading && !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading products…
        </div>
      ) : error && !data ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {error instanceof ApiError ? error.message : "Could not load the review queue."}
          </p>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            Try again
          </Button>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <PackageSearch className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="font-serif text-xl">
            {tab === "review" ? "Queue is clear" : "Nothing here"}
          </p>
          <p className="text-sm text-muted-foreground">
            {tab === "review"
              ? "No vendor products are waiting for approval."
              : search
                ? "Try a different search."
                : `No ${tab} products found.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <article
              key={p.id}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
            >
              <div className="relative h-40 bg-secondary/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.images?.[0] || "/placeholder.svg"}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
                <Badge
                  variant={statusBadge[p.status] ?? "outline"}
                  className="absolute left-3 top-3 capitalize"
                >
                  {p.status === "review" ? "in review" : p.status}
                </Badge>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {p.category ?? "Uncategorised"} · {p.sku}
                  </p>
                  <h2 className="mt-1 font-medium leading-snug text-pretty">{p.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    by <span className="font-medium text-foreground">{p.owner_name}</span>
                    {p.brand ? <> · {p.brand}</> : null}
                  </p>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-2xl">{formatINR(p.price)}</span>
                  {p.mrp != null && p.mrp > p.price && (
                    <span className="text-sm text-muted-foreground line-through">
                      {formatINR(p.mrp)}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {p.stock.toLocaleString("en-IN")} in stock
                  </span>
                </div>

                {p.status === "rejected" && p.review_note && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    Reason: {p.review_note}
                  </p>
                )}

                {tab === "review" && (
                  <div className="mt-auto flex gap-2 border-t border-border pt-4">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={busyId === p.id}
                      onClick={() => decide(p, "approve")}
                    >
                      {busyId === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Check aria-hidden />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-destructive hover:bg-destructive/10"
                      disabled={busyId === p.id}
                      onClick={() => {
                        setRejecting(p);
                        setReason("");
                        setActionError(null);
                      }}
                    >
                      <X aria-hidden />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft aria-hidden />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject product"
        description={
          rejecting
            ? `"${rejecting.name}" by ${rejecting.owner_name} will be sent back with your reason.`
            : undefined
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting && reason.trim().length >= 5) decide(rejecting, "reject");
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reject-reason" className="text-sm font-medium">
              Reason for rejection
            </label>
            <textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="e.g. Images do not match the product description. Please re-upload clear photos."
              className="rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <p className="text-xs text-muted-foreground">
              The vendor sees this note on their dashboard. Minimum 5 characters.
            </p>
          </div>
          {actionError && rejecting && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {actionError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={reason.trim().length < 5 || busyId === rejecting?.id}
            >
              {busyId === rejecting?.id && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Reject product
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
