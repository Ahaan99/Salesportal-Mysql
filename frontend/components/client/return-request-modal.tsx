"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api/client";

interface Order {
  id: string;
  order_no: string;
  product_name: string;
  qty: number;
  unit_price: number;
  amount: number;
}

type ReasonCode = "defective" | "not-as-described" | "changed-mind" | "damaged" | "other";

interface ReturnRequestModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const REASON_CODES: { code: ReasonCode; label: string }[] = [
  { code: "defective", label: "Product is defective/not working" },
  { code: "not-as-described", label: "Product not as described" },
  { code: "changed-mind", label: "Changed my mind" },
  { code: "damaged", label: "Damaged in transit" },
  { code: "other", label: "Other reason" },
];

export function ReturnRequestModal({
  order,
  isOpen,
  onClose,
  onSuccess,
}: ReturnRequestModalProps) {
  const [reasonCode, setReasonCode] = useState<ReasonCode>("defective");
  const [reason, setReason] = useState("");
  const [returnQty, setReturnQty] = useState(order.qty.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError("Please describe the reason for return");
      return;
    }

    if (reason.length < 5 || reason.length > 500) {
      setError("Reason must be 5-500 characters");
      return;
    }

    const qty = parseInt(returnQty, 10);
    if (!Number.isInteger(qty) || qty <= 0 || qty > order.qty) {
      setError(`Return quantity must be 1-${order.qty}`);
      return;
    }

    setIsSubmitting(true);

    try {
      const refundAmount = order.unit_price * qty;

      const response = await api("/api/returns", {
        method: "POST",
        body: {
          order_id: order.id,
          reason: reason.trim(),
          reason_code: reasonCode,
          return_qty: qty,
          refund_amount: refundAmount,
        },
      });

      if (response) {
        // Success
        onSuccess?.();
        onClose();
        setReason("");
        setReturnQty(order.qty.toString());
        setReasonCode("defective");
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to submit return request"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card border-border shadow-lg">
          <div className="p-6">
            <h2 className="text-xl font-bold text-foreground mb-2">
              Return Order
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Order: <span className="font-medium">{order.order_no}</span> •{" "}
              {order.product_name}
            </p>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded mb-4">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Reason Code */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Reason for Return
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as ReasonCode)}
                  className="w-full px-3 py-2 border border-border rounded bg-background text-foreground text-sm"
                >
                  {REASON_CODES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Quantity to Return
                </label>
                <input
                  type="number"
                  min="1"
                  max={order.qty}
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-background text-foreground text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Max: {order.qty} items
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description (5-500 chars)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the issue or reason for return..."
                  className="w-full px-3 py-2 border border-border rounded bg-background text-foreground text-sm resize-none"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {reason.length}/500 characters
                </p>
              </div>

              {/* Refund Preview */}
              <div className="p-3 bg-muted/20 rounded border border-border">
                <p className="text-xs text-muted-foreground mb-1">Estimated Refund</p>
                <p className="text-lg font-bold text-foreground">
                  ₹{(order.unit_price * (parseInt(returnQty, 10) || 0)).toFixed(2)}
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit Return"}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
