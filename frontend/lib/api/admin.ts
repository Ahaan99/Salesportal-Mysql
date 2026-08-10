/**
 * ADMIN API — typed wrappers around the Recruweb backend admin endpoints.
 * All requests are authenticated via lib/api/client (Supabase JWT) and the
 * backend enforces requireRole("admin") on every route.
 */
import { api } from "@/lib/api/client";

export type ReviewableStatus = "review" | "live" | "rejected";

export interface AdminProduct {
  id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  brand: string | null;
  description: string | null;
  category: string | null;
  price: number;
  mrp: number | null;
  stock: number;
  sku: string;
  images: string[];
  status: ReviewableStatus | "draft" | "archived";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AdminProductsResponse {
  products: AdminProduct[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminProductCountsResponse {
  counts: Record<ReviewableStatus, number>;
}

export const ADMIN_PRODUCT_COUNTS_KEY = "/api/admin/products/counts";

export function adminProductsKey(status: ReviewableStatus, page: number, q: string) {
  const params = new URLSearchParams({ status, page: String(page) });
  if (q.trim()) params.set("q", q.trim());
  return `/api/admin/products?${params.toString()}`;
}

/** Approve a pending product — it goes live on the marketplace. */
export function approveProduct(id: string) {
  return api<{ product: AdminProduct }>(
    `/api/admin/products/${encodeURIComponent(id)}/review`,
    { method: "PATCH", body: { action: "approve" } }
  );
}

/** Reject a pending product with a reason the vendor will see. */
export function rejectProduct(id: string, reason: string) {
  return api<{ product: AdminProduct }>(
    `/api/admin/products/${encodeURIComponent(id)}/review`,
    { method: "PATCH", body: { action: "reject", reason } }
  );
}
