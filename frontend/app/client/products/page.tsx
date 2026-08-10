"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/client/confirm-dialog";
import {
  ProductEditorModal,
  type EditableProduct,
} from "@/components/client/product-editor-modal";
import { api, apiFetcher, ApiError } from "@/lib/api/client";
import { cn, formatINR } from "@/lib/utils";

/**
 * Vendor "My Products" — full CRUD backed by the real catalogue API.
 *
 * Add:    opens the editor modal (POST) — new products enter admin review.
 * Edit:   opens the editor modal (PATCH) — rejected products resubmit.
 * Delete: confirm dialog (DELETE) — products with order history are
 *         archived server-side instead of hard-deleted to preserve records.
 */

type CatalogStatus = "review" | "live" | "rejected" | "draft" | "archived";

interface MyProduct extends EditableProduct {
  brand: string | null;
  sku: string;
  status: CatalogStatus;
  rating: number | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface MyProductsResponse {
  products: MyProduct[];
  total: number;
  page: number;
  pageSize: number;
}

const statusBadge: Record<CatalogStatus, "success" | "accent" | "destructive" | "outline"> = {
  live: "success",
  review: "accent",
  rejected: "destructive",
  draft: "outline",
  archived: "outline",
};

const statusLabel: Record<CatalogStatus, string> = {
  live: "live",
  review: "in review",
  rejected: "rejected",
  draft: "draft",
  archived: "archived",
};

const STATUS_FILTERS: { value: CatalogStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "review", label: "In review" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

const PAGE_SIZE = 12;

export default function ProductsPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CatalogStatus | "all">("all");
  const [page, setPage] = useState(1);

  // CRUD UI state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MyProduct | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MyProduct | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const { data, error, isLoading, mutate } = useSWR<MyProductsResponse>(
    `/api/catalog/products?page=${page}&pageSize=${PAGE_SIZE}`,
    apiFetcher,
    { keepPreviousData: true }
  );

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? PAGE_SIZE)));
  const liveCount = products.filter((p) => p.status === "live").length;
  const pendingCount = products.filter((p) => p.status === "review").length;

  // Search + status filtering are applied to the loaded page. The API owns
  // pagination; this keeps the UI responsive without extra round-trips.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    });
  }, [products, query, statusFilter]);

  function openAdd() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(p: MyProduct) {
    setEditing(p);
    setEditorOpen(true);
  }

  function handleSaved(message: string) {
    setNotice({ kind: "success", text: message });
    void mutate();
  }

  async function handleDelete(p: MyProduct) {
    setDeletingId(p.id);
    setNotice(null);
    try {
      const result = await api<{ deleted: boolean; archived: boolean; message?: string }>(
        `/api/catalog/products/${p.id}`,
        { method: "DELETE" }
      );
      setNotice({
        kind: "success",
        text: result.archived
          ? result.message ?? `"${p.name}" was archived (it has order history).`
          : `"${p.name}" was deleted.`,
      });
      // If we deleted the last item on the current page, step back a page.
      if (result.deleted && products.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      }
      await mutate();
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof ApiError ? err.message : "Could not delete the product.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString("en-IN")} products
          {liveCount > 0 && <> · {liveCount} live</>}
          {pendingCount > 0 && <> · {pendingCount} awaiting admin approval</>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={openAdd}>
            <Plus aria-hidden />
            Add product
          </Button>
          <Link href="/client/launch" className={buttonVariants()}>
            <Plus aria-hidden />
            Launch wizard
          </Link>
        </div>
      </div>

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm",
            notice.kind === "success"
              ? "bg-secondary text-foreground"
              : "bg-destructive/10 text-destructive"
          )}
        >
          <span className="flex items-center gap-2">
            {notice.kind === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {notice.text}
          </span>
          <button
            onClick={() => setNotice(null)}
            className="text-xs font-medium underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
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
        </div>
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              aria-pressed={statusFilter === f.value}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                statusFilter === f.value
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading your products…
        </div>
      ) : error && !data ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {error instanceof ApiError ? error.message : "Could not load products."}
          </p>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            Try again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <p className="font-serif text-xl">No products found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === 0
              ? "Add your first product — it goes live once an admin approves it."
              : "Try a different search or filter."}
          </p>
          {total === 0 && (
            <Button onClick={openAdd} className="mt-4">
              <Plus aria-hidden />
              Add product
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <article
              key={p.id}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
            >
              <div className="relative h-44 bg-secondary/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.images?.[0] || "/placeholder.svg"}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {p.brand ? `${p.brand} · ` : ""}
                      {p.sku}
                    </p>
                    <h2 className="mt-1 font-medium leading-snug text-pretty">{p.name}</h2>
                  </div>
                  <Badge variant={statusBadge[p.status]} className="capitalize">
                    {statusLabel[p.status]}
                  </Badge>
                </div>

                {p.status === "review" && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Waiting for admin approval — not visible to buyers yet.
                  </p>
                )}
                {p.status === "rejected" && p.review_note && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
                    Rejected: {p.review_note}
                  </p>
                )}

                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-2xl">{formatINR(p.price)}</span>
                  {p.mrp != null && p.mrp > p.price && (
                    <span className="text-sm text-muted-foreground line-through">
                      {formatINR(p.mrp)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>
                    {p.stock > 0
                      ? `${p.stock.toLocaleString("en-IN")} in stock`
                      : "Out of stock"}
                  </span>
                  {p.rating != null && p.rating > 0 ? (
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden />
                      {p.rating}
                    </span>
                  ) : (
                    <span>Not rated yet</span>
                  )}
                </div>

                <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(p)}
                    disabled={p.status === "archived" || deletingId === p.id}
                  >
                    <Pencil aria-hidden />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(p)}
                    disabled={deletingId === p.id}
                  >
                    {deletingId === p.id ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <Trash2 aria-hidden />
                    )}
                    Delete
                  </Button>
                </div>
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

      <ProductEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        product={editing}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
        title="Delete product?"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" (${deleteTarget.sku}) will be permanently deleted. If it has order history it will be archived instead, so past orders stay intact.`
            : ""
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
