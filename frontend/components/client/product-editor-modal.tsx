"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api, apiFetcher, ApiError } from "@/lib/api/client";

/**
 * Add / Edit product modal backed by the real catalogue API.
 *
 * - Create: POST /api/catalog/products  (new products enter admin review)
 * - Edit:   PATCH /api/catalog/products/:id (rejected products resubmit to review)
 *
 * Client-side validation mirrors the server rules; on 422 the server's
 * per-field errors take precedence so the two can never disagree silently.
 */

interface Category {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  level: number;
  sort_order: number;
}

export interface EditableProduct {
  id: string;
  name: string;
  brand: string | null;
  description?: string | null;
  price: number;
  mrp: number | null;
  stock: number;
  status: string;
  images: string[];
  category_id?: number | null;
}

interface FormState {
  name: string;
  brand: string;
  description: string;
  price: string;
  mrp: string;
  stock: string;
  categoryId: string;
  images: string[];
}

const MAX_IMAGES = 7;

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const isValidImageRef = (s: string) =>
  /^https:\/\/\S+$/.test(s) || (/^\/(?!\/)[\w\-./@%]+$/.test(s) && !s.includes(".."));

function toForm(p: EditableProduct | null): FormState {
  return {
    name: p?.name ?? "",
    brand: p?.brand ?? "",
    description: p?.description ?? "",
    price: p ? String(p.price) : "",
    mrp: p?.mrp != null ? String(p.mrp) : "",
    stock: p ? String(p.stock) : "",
    categoryId: p?.category_id != null ? String(p.category_id) : "",
    images: p?.images?.length ? [...p.images] : [""],
  };
}

function validate(f: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = f.name.trim();
  const price = Number(f.price);
  const mrp = f.mrp.trim() === "" ? null : Number(f.mrp);
  const stock = Number(f.stock);

  if (name.length < 3 || name.length > 180) errors.name = "Name must be 3-180 characters.";
  if (f.description.trim().length > 5000) errors.description = "Description is too long (max 5000).";
  if (!Number.isFinite(price) || price <= 0) errors.price = "Enter a valid selling price.";
  if (mrp !== null && (!Number.isFinite(mrp) || mrp < price))
    errors.mrp = "MRP must be greater than or equal to the selling price.";
  if (!Number.isInteger(stock) || stock < 0) errors.stock = "Enter a valid stock quantity.";
  if (!f.categoryId) errors.categoryId = "Pick a subcategory.";
  const urls = f.images.map((i) => i.trim()).filter(Boolean);
  if (urls.length > MAX_IMAGES) errors.images = `Maximum ${MAX_IMAGES} images.`;
  else if (urls.some((u) => !isValidImageRef(u)))
    errors.images = "Image links must be https URLs or local /paths.";
  return errors;
}

export function ProductEditorModal({
  open,
  onClose,
  product,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** When provided, the form edits this product; otherwise it creates one. */
  product: EditableProduct | null;
  /** Called after a successful save so the parent can revalidate its list. */
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: catData, error: catError } = useSWR<{ categories: Category[] }>(
    open ? "/api/catalog/categories" : null,
    apiFetcher
  );

  // Group leaf categories under their parents for an accessible <optgroup> UI.
  const groups = useMemo(() => {
    const cats = catData?.categories ?? [];
    const parents = cats.filter((c) => c.level === 1);
    const leaves = cats.filter((c) => c.level === 2);
    return parents
      .map((p) => ({ parent: p, children: leaves.filter((l) => l.parent_id === p.id) }))
      .filter((g) => g.children.length > 0);
  }, [catData]);

  useEffect(() => {
    if (open) {
      setForm(toForm(product));
      setErrors({});
      setFormError(null);
      setSaving(false);
    }
  }, [open, product]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setImage(index: number, value: string) {
    setForm((f) => {
      const images = [...f.images];
      images[index] = value;
      return { ...f, images };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // double-submit guard

    const clientErrors = validate(form);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      setFormError(null);
      return;
    }

    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      mrp: form.mrp.trim() === "" ? null : Number(form.mrp),
      stock: Number(form.stock),
      categoryId: Number(form.categoryId),
      images: form.images.map((i) => i.trim()).filter(Boolean),
    };

    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      if (product) {
        await api(`/api/catalog/products/${product.id}`, { method: "PATCH", body: payload });
        onSaved(
          product.status === "rejected"
            ? "Changes saved — the product was resubmitted for admin review."
            : "Product updated."
        );
      } else {
        await api("/api/catalog/products", { method: "POST", body: payload });
        onSaved("Product created — it goes live once an admin approves it.");
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const field = (name: string, label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`pe-${name}`} className="text-sm font-medium">
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

  const firstImage = form.images.find((i) => i.trim() && isValidImageRef(i.trim()));

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={product ? "Edit product" : "Add a product"}
      description={
        product
          ? product.status === "rejected"
            ? "Saving resubmits this product for admin review."
            : "Changes apply to your catalogue immediately."
          : "New products go into admin review before buyers can see them."
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        {field(
          "name",
          "Product name",
          <Input
            id="pe-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Organic Turmeric Powder 500g"
            maxLength={180}
            aria-invalid={Boolean(errors.name)}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "brand",
            "Brand (optional)",
            <Input
              id="pe-brand"
              value={form.brand}
              onChange={(e) => set("brand", e.target.value)}
              placeholder="e.g. BIBA"
              maxLength={80}
            />
          )}
          {field(
            "categoryId",
            "Category",
            <select
              id="pe-categoryId"
              className={selectClass}
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              aria-invalid={Boolean(errors.categoryId)}
              disabled={!catData && !catError}
            >
              <option value="" disabled>
                {catError ? "Could not load categories" : catData ? "Select a subcategory" : "Loading categories…"}
              </option>
              {groups.map((g) => (
                <optgroup key={g.parent.id} label={g.parent.name}>
                  {g.children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {field(
          "description",
          "Description (optional)",
          <textarea
            id="pe-description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="What makes this product great?"
            className="flex w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-invalid={Boolean(errors.description)}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          {field(
            "price",
            "Selling price (₹)",
            <Input
              id="pe-price"
              type="number"
              min={1}
              step="0.01"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              aria-invalid={Boolean(errors.price)}
            />
          )}
          {field(
            "mrp",
            "MRP (₹, optional)",
            <Input
              id="pe-mrp"
              type="number"
              min={1}
              step="0.01"
              inputMode="decimal"
              value={form.mrp}
              onChange={(e) => set("mrp", e.target.value)}
              aria-invalid={Boolean(errors.mrp)}
            />
          )}
          {field(
            "stock",
            "Stock (units)",
            <Input
              id="pe-stock"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={form.stock}
              onChange={(e) => set("stock", e.target.value)}
              aria-invalid={Boolean(errors.stock)}
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Images (https links or local /paths)</span>
          <div className="flex flex-col gap-2">
            {form.images.map((img, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={img}
                  onChange={(e) => setImage(i, e.target.value)}
                  placeholder="https://… or /products/example.png"
                  aria-label={`Image ${i + 1}`}
                />
                {form.images.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }))
                    }
                    aria-label={`Remove image ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {errors.images && (
            <p role="alert" className="text-xs text-destructive">
              {errors.images}
            </p>
          )}
          <div className="flex items-center gap-3">
            {form.images.length < MAX_IMAGES && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((f) => ({ ...f, images: [...f.images, ""] }))}
              >
                <Plus aria-hidden />
                Add image
              </Button>
            )}
            {firstImage && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={firstImage || "/placeholder.svg"}
                alt="Product preview"
                className="h-12 w-12 rounded-lg border border-border object-cover"
              />
            )}
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {product ? "Save changes" : "Add product"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
