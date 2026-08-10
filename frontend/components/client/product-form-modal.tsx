"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { Product, ProductInput, ProductStatus } from "@/lib/types";

const CATEGORIES = ["Grocery", "Wellness", "Kitchen", "Personal Care", "Home", "Apparel"];
const STATUSES: { value: ProductStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "in-review", label: "Submit for review" },
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
];

const IMAGES: { value: string; label: string }[] = [
  { value: "/products/almond-oil.png", label: "Almond oil bottle" },
  { value: "/products/tawa.png", label: "Cast iron tawa" },
  { value: "/products/jaggery.png", label: "Jaggery pouch" },
  { value: "/products/bottle.png", label: "Copper bottle" },
  { value: "/products/ghee.png", label: "Ghee jar" },
  { value: "/products/toothbrush.png", label: "Bamboo toothbrush" },
];

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function emptyInput(): ProductInput {
  return {
    name: "",
    category: "Grocery",
    price: 0,
    mrp: 0,
    stock: 0,
    status: "draft",
    image: IMAGES[0].value,
  };
}

export function ProductFormModal({
  open,
  onClose,
  product,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** When provided, the form edits this product; otherwise it creates one. */
  product: Product | null;
  onSubmit: (input: ProductInput) => { ok: boolean; errors: Record<string, string> };
}) {
  const [form, setForm] = useState<ProductInput>(emptyInput);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(
        product
          ? {
              name: product.name,
              category: product.category,
              price: product.price,
              mrp: product.mrp,
              stock: product.stock,
              status: product.status,
              image: product.image,
            }
          : emptyInput()
      );
    }
  }, [open, product]);

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = onSubmit(form);
    if (result.ok) {
      onClose();
    } else {
      setErrors(result.errors);
    }
  }

  const field = (name: string, label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`pf-${name}`} className="text-sm font-medium">
        {label}
      </label>
      {node}
      {errors[name] && (
        <p role="alert" className="text-xs text-destructive">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? `Edit ${product.id}` : "Add a product"}
      description={
        product
          ? "Changes apply immediately to your catalogue."
          : "New products start in the status you choose below."
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {field(
          "name",
          "Product name",
          <Input
            id="pf-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Organic Turmeric Powder 500g"
            aria-invalid={Boolean(errors.name)}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "category",
            "Category",
            <select
              id="pf-category"
              className={selectClass}
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {field(
            "status",
            "Status",
            <select
              id="pf-status"
              className={selectClass}
              value={form.status}
              onChange={(e) => set("status", e.target.value as ProductStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {field(
            "price",
            "Selling price (₹)",
            <Input
              id="pf-price"
              type="number"
              min={1}
              inputMode="numeric"
              value={form.price || ""}
              onChange={(e) => set("price", Number(e.target.value))}
              aria-invalid={Boolean(errors.price)}
            />
          )}
          {field(
            "mrp",
            "MRP (₹)",
            <Input
              id="pf-mrp"
              type="number"
              min={1}
              inputMode="numeric"
              value={form.mrp || ""}
              onChange={(e) => set("mrp", Number(e.target.value))}
              aria-invalid={Boolean(errors.mrp)}
            />
          )}
          {field(
            "stock",
            "Stock (units)",
            <Input
              id="pf-stock"
              type="number"
              min={0}
              inputMode="numeric"
              value={Number.isFinite(form.stock) ? form.stock : ""}
              onChange={(e) => set("stock", Number(e.target.value))}
              aria-invalid={Boolean(errors.stock)}
            />
          )}
        </div>

        {field(
          "image",
          "Product image",
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.image || "/placeholder.svg"}
              alt="Selected product preview"
              className="h-14 w-14 rounded-lg border border-border object-cover"
            />
            <select
              id="pf-image"
              className={selectClass}
              value={form.image}
              onChange={(e) => set("image", e.target.value)}
            >
              {IMAGES.map((img) => (
                <option key={img.value} value={img.value}>
                  {img.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{product ? "Save changes" : "Add product"}</Button>
        </div>
      </form>
    </Modal>
  );
}
