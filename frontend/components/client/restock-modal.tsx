"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useVendorStore, type InventoryProduct } from "@/lib/store/vendor-store";
import type { StockAdjustmentType } from "@/lib/types";

const TYPES: { value: StockAdjustmentType; label: string; hint: string }[] = [
  { value: "restock", label: "Restock", hint: "Adds units to inventory" },
  { value: "correction", label: "Correction", hint: "Removes units after a count mismatch" },
  { value: "damage", label: "Damage / write-off", hint: "Removes damaged or expired units" },
];

export function RestockModal({
  product,
  onClose,
}: {
  product: InventoryProduct | null;
  onClose: () => void;
}) {
  const { adjustStock } = useVendorStore();
  const [type, setType] = useState<StockAdjustmentType>("restock");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      setType("restock");
      setQty("");
      setNote("");
      setError(null);
      setSubmitting(false);
    }
  }, [product]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || submitting) return;
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) {
      setError("Quantity must be a whole number greater than 0.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await adjustStock(product.id, type, n, note);
    setSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not adjust stock.");
    }
  }

  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      title={product ? `Adjust stock — ${product.name}` : "Adjust stock"}
      description={
        product ? `Current stock: ${product.stock.toLocaleString("en-IN")} units` : undefined
      }
      className="sm:max-w-md"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Adjustment type</legend>
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
                type === t.value ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"
              }`}
            >
              <input
                type="radio"
                name="adj-type"
                value={t.value}
                checked={type === t.value}
                onChange={() => setType(t.value)}
                className="accent-[var(--primary,#1d5c3f)]"
              />
              <span>
                <span className="font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="adj-qty" className="text-sm font-medium">
            Quantity (units)
          </label>
          <Input
            id="adj-qty"
            type="number"
            min={1}
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="e.g. 250"
            aria-invalid={Boolean(error)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="adj-note" className="text-sm font-medium">
            Note <span className="font-normal text-muted-foreground">(recommended)</span>
          </label>
          <Textarea
            id="adj-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this adjustment happening?"
            className="min-h-[70px]"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? "Applying..." : "Apply adjustment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
