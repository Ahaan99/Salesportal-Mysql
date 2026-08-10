"use client";

import { useState, useMemo, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api/client";
import Link from "next/link";
import Image from "next/image";

type ReturnStatus = "pending" | "approved" | "rejected" | "shipped" | "completed";
type ReasonCode = "defective" | "not-as-described" | "changed-mind" | "damaged" | "other";

interface Return {
  id: string;
  order_id: string;
  reason: string;
  reason_code: ReasonCode;
  return_qty: number;
  refund_amount: number;
  status: ReturnStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  order: {
    order_no: string;
    product_name: string;
    customer_name: string;
    city: string;
    amount: number;
  };
  refund?: {
    id: string;
    amount: number;
    status: string;
  } | null;
}

const REASON_CODE_LABELS: Record<ReasonCode, string> = {
  defective: "Product Defective",
  "not-as-described": "Not as Described",
  "changed-mind": "Changed Mind",
  damaged: "Damaged in Transit",
  other: "Other Reason",
};

const STATUS_META: Record<ReturnStatus, { label: string; badge: string }> = {
  pending: { label: "Pending", badge: "default" },
  approved: { label: "Approved", badge: "success" },
  rejected: { label: "Rejected", badge: "destructive" },
  shipped: { label: "Shipped Back", badge: "secondary" },
  completed: { label: "Completed", badge: "success" },
};

export default function ReturnsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | "">("");
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const pageSize = 10;

  const swrKey = `/api/returns?page=${page}&page_size=${pageSize}${statusFilter ? `&status=${statusFilter}` : ""}`;

  const handleCancelReturn = useCallback(
    async (id: string) => {
      if (!window.confirm("Are you sure you want to cancel this return request?")) return;
      setCancelError(null);
      setCancellingId(id);
      try {
        await api(`/api/returns/${id}`, { method: "DELETE" });
        await mutate(swrKey);
      } catch (err) {
        setCancelError(
          err instanceof ApiError ? err.message : "Could not cancel the return. Please try again."
        );
      } finally {
        setCancellingId(null);
      }
    },
    [swrKey]
  );

  // Fetch returns
  const { data: response, error: fetchError, isLoading } = useSWR(
    `/api/returns?page=${page}&page_size=${pageSize}${statusFilter ? `&status=${statusFilter}` : ""}`,
    () =>
      api<{
        returns: Return[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        `/api/returns?page=${page}&page_size=${pageSize}${statusFilter ? `&status=${statusFilter}` : ""}`
      ),
    { revalidateOnFocus: false }
  );

  const returns = response?.returns ?? [];
  const total = response?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const statusOptions: (ReturnStatus | "")[] = ["", "pending", "approved", "rejected", "shipped", "completed"];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Returns & Refunds</h1>
          <p className="text-muted-foreground">
            Track and manage your product returns and refund status
          </p>
        </div>

        {/* Filters */}
        <Card className="p-4 mb-6 bg-card border-border">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Filter by Status:</span>
              <div className="flex gap-2 flex-wrap">
                {statusOptions.map((status) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setStatusFilter(status);
                      setPage(1);
                    }}
                  >
                    {status || "All"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Returns List */}
        <div className="space-y-4">
          {isLoading && (
            <Card className="p-8 bg-card border-border text-center">
              <p className="text-muted-foreground">Loading returns...</p>
            </Card>
          )}

          {fetchError && (
            <Card className="p-4 bg-destructive/10 border-destructive/20">
              <p className="text-destructive">
                Failed to load returns: {fetchError instanceof ApiError ? fetchError.message : "Unknown error"}
              </p>
            </Card>
          )}

          {cancelError && (
            <Card className="p-4 bg-destructive/10 border-destructive/20" role="alert">
              <p className="text-destructive">{cancelError}</p>
            </Card>
          )}

          {!isLoading && returns.length === 0 && (
            <Card className="p-8 bg-card border-border text-center">
              <p className="text-muted-foreground mb-4">No returns found</p>
              <Link href="/client/orders">
                <Button variant="outline">Browse Orders</Button>
              </Link>
            </Card>
          )}

          {returns.map((ret) => (
            <Card key={ret.id} className="p-4 bg-card border-border hover:shadow-md transition-shadow">
              <div className="flex flex-col gap-4">
                {/* Top Row: Order Info + Status */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-foreground">
                        Order {ret.order?.order_no ?? "—"}
                      </h3>
                      <Badge variant={STATUS_META[ret.status].badge as any}>
                        {STATUS_META[ret.status].label}
                      </Badge>
                      {ret.refund && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Refund {ret.refund.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{ret.order?.product_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ret.order?.customer_name} • {ret.order?.city}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-foreground">
                      ₹{ret.refund_amount.toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground">Refund Amount</p>
                  </div>
                </div>

                {/* Return Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/20 rounded border border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p className="text-sm font-medium text-foreground">
                      {REASON_CODE_LABELS[ret.reason_code]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Qty</p>
                    <p className="text-sm font-medium text-foreground">{ret.return_qty} items</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(ret.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Updated</p>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(ret.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Reason Details */}
                <div className="p-3 bg-muted/10 rounded border border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Return Reason</p>
                  <p className="text-sm text-foreground">{ret.reason}</p>
                </div>

                {/* Refund Details */}
                {ret.refund && (
                  <div className="p-3 bg-green-50 rounded border border-green-200">
                    <p className="text-xs font-medium text-green-700 mb-1">Refund Status</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            ret.refund.status === "completed"
                              ? "success"
                              : ret.refund.status === "failed"
                                ? "destructive"
                                : "accent"
                          }
                        >
                          {ret.refund.status.charAt(0).toUpperCase() + ret.refund.status.slice(1)}
                        </Badge>
                        <p className="text-sm text-green-700">
                          ₹{ret.refund.amount.toFixed(2)} refund
                        </p>
                      </div>
                      {ret.refund.status === "completed" && (
                        <p className="text-xs text-green-600">✓ Refund processed</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedReturn(ret)}
                  >
                    View Details
                  </Button>
                  {ret.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={cancellingId === ret.id}
                      onClick={() => handleCancelReturn(ret.id)}
                    >
                      {cancellingId === ret.id ? "Cancelling..." : "Cancel"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && returns.length === 0 && statusFilter && (
          <div className="mt-6 text-center">
            <p className="text-muted-foreground mb-4">No returns with status "{statusFilter}"</p>
            <Button
              variant="outline"
              onClick={() => setStatusFilter("")}
            >
              Clear Filter
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
