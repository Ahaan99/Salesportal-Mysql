"use client";

/**
 * VENDOR STORE — client-side state for the vendor portal.
 *
 * Fully backed by the real Recruweb API (no mock data):
 *   - products         GET  /api/catalog/products
 *   - adjustments      GET  /api/catalog/stock-adjustments
 *   - adjustStock      POST /api/catalog/products/:id/stock
 *   - profile          GET  /api/client/profile
 *   - saveProfile      PUT  /api/client/profile
 *
 * SWR keeps everything cached and revalidated; mutations refresh the
 * affected caches so every page stays in sync.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import useSWR from "swr";
import { api, apiFetcher, ApiError } from "@/lib/api/client";
import { validatePhone } from "@/lib/validation/phone";
import type { CompanyProfile, StockAdjustment, StockAdjustmentType } from "@/lib/types";

/* ------------------------------ validation ------------------------------ */

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;

export function validateCompanyProfile(p: CompanyProfile): ValidationResult {
  const errors: Record<string, string> = {};
  if (p.companyName.trim().length < 2) errors.companyName = "Company name is required.";
  if (p.contactName.trim().length < 2) errors.contactName = "Contact person is required.";
  if (!EMAIL_RE.test(p.email.trim())) errors.email = "Enter a valid email address.";
  const phoneResult = validatePhone(p.phone);
  if (!phoneResult.ok) errors.phone = phoneResult.error ?? "Enter a valid phone number.";
  if (p.gstin.trim() && !GSTIN_RE.test(p.gstin.trim().toUpperCase()))
    errors.gstin = "GSTIN format is invalid (e.g. 27AAECV4321F1Z5).";
  if (p.pan.trim() && !PAN_RE.test(p.pan.trim().toUpperCase()))
    errors.pan = "PAN format is invalid (e.g. AAECV4321F).";
  if (!p.addressLine.trim()) errors.addressLine = "Address is required.";
  if (!p.city.trim()) errors.city = "City is required.";
  if (!p.state.trim()) errors.state = "State is required.";
  if (!PINCODE_RE.test(p.pincode.trim())) errors.pincode = "Enter a valid 6-digit PIN code.";
  if (p.ifsc.trim() && !IFSC_RE.test(p.ifsc.trim().toUpperCase()))
    errors.ifsc = "IFSC format is invalid (e.g. HDFC0001234).";
  if (p.accountNumber.trim() && !/^[0-9]{9,18}$/.test(p.accountNumber.trim()))
    errors.accountNumber = "Account number must be 9-18 digits.";
  if (p.website.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/.test(p.website.trim()))
    errors.website = "Website must be a valid URL starting with http(s)://";
  return { ok: Object.keys(errors).length === 0, errors };
}

/* ------------------------------ API shapes ------------------------------ */

interface ApiProduct {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  mrp: number | null;
  stock: number;
  sku: string;
  status: string;
  images: string[];
  category: { name: string } | null;
}

interface ApiAdjustment {
  id: string;
  product_id: string | null;
  product_name: string;
  type: StockAdjustmentType;
  delta: number;
  resulting_stock: number;
  note: string;
  created_at: string;
}

/** Product shape the inventory UI works with (mapped from the API). */
export interface InventoryProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  mrp: number | null;
  stock: number;
  status: string;
  sku: string;
  image: string | null;
}

export const EMPTY_PROFILE: CompanyProfile = {
  companyName: "",
  legalName: "",
  tagline: "",
  about: "",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  gstin: "",
  pan: "",
  addressLine: "",
  city: "",
  state: "",
  pincode: "",
  bankName: "",
  accountNumber: "",
  ifsc: "",
  categories: [],
};

/* -------------------------------- context ------------------------------- */

export const LOW_STOCK_THRESHOLD = 150;

interface VendorStore {
  products: InventoryProduct[];
  adjustments: StockAdjustment[];
  profile: CompanyProfile;
  /** true while the first load of products/adjustments is in flight */
  inventoryLoading: boolean;
  inventoryError: string | null;
  /** true while the first load of the profile is in flight */
  profileLoading: boolean;
  adjustStock: (
    productId: string,
    type: StockAdjustmentType,
    qty: number,
    note: string
  ) => Promise<{ ok: boolean; error?: string }>;
  saveProfile: (profile: CompanyProfile) => Promise<{ ok: boolean; errors: Record<string, string> }>;
}

const VendorContext = createContext<VendorStore | null>(null);

export function VendorProvider({ children }: { children: ReactNode }) {
  const {
    data: productData,
    error: productError,
    isLoading: productsLoading,
    mutate: mutateProducts,
  } = useSWR<{ products: ApiProduct[] }>("/api/catalog/products?page=1&pageSize=50", apiFetcher);

  const {
    data: adjData,
    error: adjError,
    isLoading: adjLoading,
    mutate: mutateAdjustments,
  } = useSWR<{ adjustments: ApiAdjustment[] }>("/api/catalog/stock-adjustments", apiFetcher);

  const {
    data: profileData,
    isLoading: profileLoading,
    mutate: mutateProfile,
  } = useSWR<{ profile: CompanyProfile }>("/api/client/profile", apiFetcher);

  const products = useMemo<InventoryProduct[]>(
    () =>
      (productData?.products ?? [])
        .filter((p) => p.status !== "archived")
        .map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category?.name ?? p.brand ?? "—",
          price: Number(p.price),
          mrp: p.mrp == null ? null : Number(p.mrp),
          stock: p.stock,
          status: p.status,
          sku: p.sku,
          image: p.images?.[0] ?? null,
        })),
    [productData]
  );

  const adjustments = useMemo<StockAdjustment[]>(
    () =>
      (adjData?.adjustments ?? []).map((a) => ({
        id: a.id,
        productId: a.product_id ?? "",
        productName: a.product_name,
        type: a.type,
        delta: a.delta,
        resultingStock: a.resulting_stock,
        note: a.note || "—",
        at: a.created_at,
      })),
    [adjData]
  );

  const adjustStock = useCallback(
    async (productId: string, type: StockAdjustmentType, qty: number, note: string) => {
      if (!Number.isInteger(qty) || qty <= 0) {
        return { ok: false, error: "Quantity must be a whole number greater than 0." };
      }
      try {
        await api(`/api/catalog/products/${productId}/stock`, {
          method: "POST",
          body: { type, qty, note },
        });
        await Promise.all([mutateProducts(), mutateAdjustments()]);
        return { ok: true };
      } catch (e) {
        const message =
          e instanceof ApiError
            ? e.fields?.qty ?? e.fields?.type ?? e.message
            : "Could not adjust stock.";
        return { ok: false, error: message };
      }
    },
    [mutateProducts, mutateAdjustments]
  );

  const saveProfile = useCallback(
    async (next: CompanyProfile) => {
      const result = validateCompanyProfile(next);
      if (!result.ok) return result;
      try {
        const res = await api<{ profile: CompanyProfile }>("/api/client/profile", {
          method: "PUT",
          body: {
            ...next,
            companyName: next.companyName.trim(),
            email: next.email.trim(),
            phone: validatePhone(next.phone).normalized ?? next.phone.trim(),
            gstin: next.gstin.trim().toUpperCase(),
            pan: next.pan.trim().toUpperCase(),
            ifsc: next.ifsc.trim().toUpperCase(),
          },
        });
        await mutateProfile(res, { revalidate: false });
        return { ok: true, errors: {} };
      } catch (e) {
        if (e instanceof ApiError && e.fields) return { ok: false, errors: e.fields };
        return {
          ok: false,
          errors: { form: e instanceof ApiError ? e.message : "Could not save your profile." },
        };
      }
    },
    [mutateProfile]
  );

  const value = useMemo<VendorStore>(
    () => ({
      products,
      adjustments,
      profile: profileData?.profile ?? EMPTY_PROFILE,
      inventoryLoading: (productsLoading && !productData) || (adjLoading && !adjData),
      inventoryError:
        productError instanceof ApiError
          ? productError.message
          : adjError instanceof ApiError
            ? adjError.message
            : productError || adjError
              ? "Could not load inventory."
              : null,
      profileLoading: profileLoading && !profileData,
      adjustStock,
      saveProfile,
    }),
    [
      products,
      adjustments,
      profileData,
      productsLoading,
      productData,
      adjLoading,
      adjData,
      productError,
      adjError,
      profileLoading,
      adjustStock,
      saveProfile,
    ]
  );

  return <VendorContext.Provider value={value}>{children}</VendorContext.Provider>;
}

export function useVendorStore(): VendorStore {
  const ctx = useContext(VendorContext);
  if (!ctx) throw new Error("useVendorStore must be used inside <VendorProvider>");
  return ctx;
}
