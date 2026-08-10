"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertCircle, ChevronLeft, ChevronRight, Search, ShoppingBag, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetcher } from "@/lib/api/client";
import { productsKey, type ProductsResponse } from "@/lib/api/field";
import { cn, formatINR } from "@/lib/utils";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
] as const;

export default function FieldProductsPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string>("newest");
  const [page, setPage] = useState(1);

  const { data, error, isLoading } = useSWR<ProductsResponse>(
    productsKey({ q, sort, page }),
    apiFetcher,
    { keepPreviousData: true }
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(search.trim());
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={submitSearch} className="relative w-full sm:max-w-xs" role="search">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or brand…"
            className="pl-9"
            aria-label="Search products"
            maxLength={120}
          />
        </form>
        <div className="flex items-center gap-2">
          <label htmlFor="product-sort" className="text-xs text-muted-foreground">
            Sort
          </label>
          <select
            id="product-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
          <p className="text-sm font-medium">Could not load the catalogue.</p>
          <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
        </div>
      ) : isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : data && data.products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <p className="text-sm font-medium">No products found{q ? ` for “${q}”` : ""}.</p>
          <p className="text-xs text-muted-foreground">Try a different search term or clear the filter.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {data?.total.toLocaleString("en-IN")} live product{data?.total === 1 ? "" : "s"}
            {q ? ` matching “${q}”` : ""} — every sale earns you 8% commission.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data?.products.map((p) => {
              const discount =
                p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
              return (
                <article
                  key={p.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.brand ?? "—"}
                        {p.category ? ` · ${p.category}` : ""}
                      </p>
                    </div>
                    {p.rating != null && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
                        <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden />
                        {Number(p.rating).toFixed(1)}
                      </span>
                    )}
                  </div>

                  {p.description && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {p.description}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <span className="font-serif text-2xl tracking-tight">{formatINR(p.price)}</span>
                    {p.mrp != null && p.mrp > p.price && (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatINR(p.mrp)}
                      </span>
                    )}
                    {discount > 0 && <Badge variant="accent">{discount}% off</Badge>}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        "text-xs",
                        p.stock <= 5 ? "font-medium text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {p.stock <= 5 ? `Only ${p.stock} left` : `${p.stock} in stock`}
                    </span>
                    <Link
                      href={`/field/sell?product=${p.id}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
                      Sell this
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Catalogue pages">
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
