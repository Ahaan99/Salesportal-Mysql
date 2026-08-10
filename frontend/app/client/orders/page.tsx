"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertCircle,
  Ban,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  RotateCw,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, ApiError, apiFetcher } from "@/lib/api/client";
import { cn, formatINR } from "@/lib/utils";
import { ReturnRequestModal } from "@/components/client/return-request-modal";

// Using real CDN images - DummyJSON provides free product images
const CDN_BASE_URL = "https://cdn.dummyjson.com/product-images";
const DEFAULT_PRODUCT_IMAGES: Record<string, string> = {
  "iphone": `${CDN_BASE_URL}/smartphones/1.jpg`,
  "watch": `${CDN_BASE_URL}/mens-watches/rolex-submariner-watch/1.webp`,
  "laptop": `${CDN_BASE_URL}/laptops/apple-macbook-pro-14-2023/1.webp`,
  "headphones": `${CDN_BASE_URL}/headphones/sony-wf-c700n-wireless-headphones/1.webp`,
  "tablet": `${CDN_BASE_URL}/tablets/apple-ipad-pro-11-2022/1.webp`,
  "camera": `${CDN_BASE_URL}/cameras/nikon-z9/1.webp`,
  "default": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop",
};

interface Order {
  id: string;
  order_no: string;
  product_name: string;
  product_image: string | null;
  customer_name: string;
  city: string;
  state: string;
  channel: "field" | "online";
  status: OrderStatus;
  qty: number;
  unit_price: number;
  amount: number;
  placed_at: string;
  officer_name: string | null;
}

type OrderStatus =
  | "processing"
  | "packed"
  | "in-transit"
  | "delivered"
  | "cancelled"
  | "returned";

interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

interface Summary {
  total_amount: number;
  total_orders: number;
  field_share: number;
  delivered: number;
  in_transit: number;
  returned: number;
}

const STATUS_META: Record<
  OrderStatus,
  { label: string; badge: "success" | "accent" | "outline" | "destructive" | "default" }
> = {
  processing: { label: "Processing", badge: "outline" },
  packed: { label: "Packed", badge: "outline" },
  "in-transit": { label: "In transit", badge: "accent" },
  delivered: { label: "Delivered", badge: "success" },
  cancelled: { label: "Cancelled", badge: "destructive" },
  returned: { label: "Returned", badge: "destructive" },
};

const ALL_STATUSES = Object.keys(STATUS_META) as OrderStatus[];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_high", label: "Amount: high to low" },
  { value: "amount_low", label: "Amount: low to high" },
] as const;

const PAGE_SIZE = 15;
const CANCELLABLE: OrderStatus[] = ["processing", "packed"];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function getProductImageUrl(productName: string, fallback: string | null): string {
  if (fallback && fallback.startsWith("http")) return fallback;
  
  const nameLower = productName.toLowerCase();
  for (const [key, url] of Object.entries(DEFAULT_PRODUCT_IMAGES)) {
    if (key !== "default" && nameLower.includes(key)) {
      return url;
    }
  }
  return DEFAULT_PRODUCT_IMAGES.default;
}

export default function OrdersPageWithReturns() {
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [channel, setChannel] = useState<"" | "field" | "online">("");
  const [sort, setSort] = useState<string>("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOrderForReturn, setSelectedOrderForReturn] = useState<Order | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);

  const debouncedQ = useDebounced(q, 500);

  // Fetch orders
  const { data: ordersRes, error: ordersErr, isLoading: ordersLoading, mutate: mutateList } = useSWR(
    () => {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: PAGE_SIZE.toString(),
      });
      if (debouncedQ) params.set("q", debouncedQ);
      if (statuses.length) params.set("status", statuses.join(","));
      if (channel) params.set("channel", channel);
      if (sort && sort !== "newest") params.set("sort", sort);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      return `/api/orders?${params}`;
    },
    apiFetcher<OrdersResponse>,
    { revalidateOnFocus: false }
  );

  // Fetch summary
  const { data: summary } = useSWR("/api/orders/summary", apiFetcher<Summary>, {
    revalidateOnFocus: false,
  });

  const orders = ordersRes?.orders ?? [];
  const total = ordersRes?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const activeFilters =
    statuses.length + (channel ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const handleCancel = async (order: Order) => {
    if (!window.confirm(`Cancel order ${order.order_no}?`)) return;

    try {
      await api(`/api/orders/${order.id}/cancel`, { method: "POST" });
      mutateList();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) mutateList();
    }
  };

  const handleReturnClick = (order: Order) => {
    setSelectedOrderForReturn(order);
    setShowReturnModal(true);
  };

  const handleReturnSuccess = () => {
    mutateList();
    setShowReturnModal(false);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header with Returns Link */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">Your Orders</h1>
            <p className="text-muted-foreground mt-1">Track and manage your purchases</p>
          </div>
          <Link href="/client/returns">
            <Button variant="outline" className="gap-2">
              <RotateCw className="w-4 h-4" />
              Returns & Refunds
            </Button>
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Total Lifetime Value",
              value: formatINR(summary?.total_amount ?? 0),
            },
            {
              label: "Total Orders",
              value: summary?.total_orders ?? 0,
            },
            {
              label: "Delivered",
              value: summary?.delivered ?? 0,
            },
            {
              label: "In Transit / Processing",
              value: summary?.in_transit ?? 0,
            },
          ].map(({ label, value }) => (
            <Card
              key={label}
              className="p-4 bg-card border-border hover:shadow-sm transition-shadow"
            >
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold text-foreground mt-2">{value}</p>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="p-4 mb-6 bg-card border-border">
          <div className="space-y-4">
            {/* Search */}
            <div className="flex items-center gap-2 bg-muted/50 rounded px-3 py-2 border border-border">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by order #, product, customer..."
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                className="flex-1 bg-transparent text-foreground outline-none text-sm"
              />
              {q && (
                <button onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Controls */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Status Filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {["All", ...ALL_STATUSES].map((s) => {
                    const active = s === "All" ? statuses.length === 0 : statuses.includes(s as OrderStatus);
                    return (
                      <Button
                        key={s}
                        variant={active ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (s === "All") {
                            setStatuses([]);
                          } else {
                            setStatuses((current) => {
                              const newStatuses = current.filter((x) => x !== s);
                              return newStatuses.includes(s as OrderStatus)
                                ? newStatuses
                                : [...newStatuses, s as OrderStatus];
                            });
                          }
                          setPage(1);
                        }}
                      >
                        {s === "All" ? "All" : STATUS_META[s as OrderStatus]?.label || s}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Channel Filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Channel
                </label>
                <div className="flex gap-2">
                  {["", "field", "online"].map((c) => (
                    <Button
                      key={c}
                      variant={channel === c ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setChannel(c as any);
                        setPage(1);
                      }}
                    >
                      {c || "All"}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Sort
                </label>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filters */}
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="flex-1 px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="flex-1 px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground"
                  placeholder="To"
                />
              </div>
            </div>

            {/* Active Filters Display */}
            {activeFilters > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{activeFilters} filter(s) active</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatuses([]);
                    setChannel("");
                    setDateFrom("");
                    setDateTo("");
                    setPage(1);
                  }}
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Orders List */}
        {ordersLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {ordersErr && (
          <Card className="p-4 bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-destructive">Failed to load orders</h3>
                <p className="text-sm text-destructive/80 mt-1">
                  {ordersErr instanceof ApiError
                    ? ordersErr.message
                    : "An unknown error occurred"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => mutateList()}
                  className="mt-3 gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try again
                </Button>
              </div>
            </div>
          </Card>
        )}

        {!ordersLoading && orders.length === 0 && (
          <Card className="p-8 text-center bg-card border-border">
            <p className="text-muted-foreground mb-4">No orders found</p>
            {activeFilters > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setStatuses([]);
                  setChannel("");
                  setDateFrom("");
                  setDateTo("");
                  setQ("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </Card>
        )}

        {!ordersLoading && orders.length > 0 && (
          <>
            <div className="grid gap-4">
              {orders.map((order) => {
                const imageUrl = getProductImageUrl(order.product_name, order.product_image);
                
                return (
                  <Card
                    key={order.id}
                    className="overflow-hidden bg-card border-border hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4 items-start">
                        {/* Product Image */}
                        <div className="flex-shrink-0 w-24 h-24 bg-muted rounded-lg overflow-hidden border border-border">
                          <img
                            src={imageUrl}
                            alt={order.product_name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_PRODUCT_IMAGES.default;
                            }}
                          />
                        </div>

                        {/* Order Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div>
                              <h3 className="font-semibold text-foreground text-lg">
                                {order.order_no}
                              </h3>
                              <p className="text-sm text-muted-foreground truncate">
                                {order.product_name}
                              </p>
                            </div>
                            <Badge
                              variant={
                                STATUS_META[order.status]?.badge || "default"
                              }
                            >
                              {STATUS_META[order.status]?.label || order.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                            <div>
                              <p className="text-xs text-muted-foreground">Customer</p>
                              <p className="font-medium text-foreground">
                                {order.customer_name}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Location</p>
                              <p className="font-medium text-foreground">{order.city}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Qty</p>
                              <p className="font-medium text-foreground">{order.qty}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Amount</p>
                              <p className="font-bold text-foreground">
                                {formatINR(order.amount)}
                              </p>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Placed on {new Date(order.placed_at).toLocaleDateString()}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          {CANCELLABLE.includes(order.status) && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancel(order)}
                              className="gap-1"
                            >
                              <Ban className="w-3 h-3" />
                              Cancel
                            </Button>
                          )}
                          {order.status === "delivered" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReturnClick(order)}
                              className="gap-1"
                            >
                              <RotateCw className="w-3 h-3" />
                              Return
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="gap-2"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Return Request Modal */}
      {selectedOrderForReturn && (
        <ReturnRequestModal
          order={selectedOrderForReturn}
          isOpen={showReturnModal}
          onClose={() => {
            setShowReturnModal(false);
            setSelectedOrderForReturn(null);
          }}
          onSuccess={handleReturnSuccess}
        />
      )}
    </div>
  );
}
