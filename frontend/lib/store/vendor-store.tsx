"use client";

/**
 * VENDOR STORE — client-side state for the vendor portal.
 *
 * Seeded from the data layer (lib/data). All mutations flow through this
 * provider so swapping the internals to real API calls later requires no
 * UI changes. Every mutation is validated and inventory changes are
 * journaled as StockAdjustment entries (audit trail).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { validatePhone } from "@/lib/validation/phone";
import {
  getCompanyProfile,
  getProducts,
  getStockAdjustments,
} from "@/lib/data";
import type {
  CompanyProfile,
  Product,
  ProductInput,
  StockAdjustment,
  StockAdjustmentType,
} from "@/lib/types";

/* ------------------------------ validation ------------------------------ */

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

export function validateProductInput(input: ProductInput): ValidationResult {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (name.length < 3) errors.name = "Name must be at least 3 characters.";
  if (name.length > 120) errors.name = "Name must be under 120 characters.";
  if (!input.category.trim()) errors.category = "Choose a category.";
  if (!Number.isFinite(input.price) || input.price <= 0)
    errors.price = "Selling price must be greater than 0.";
  if (!Number.isFinite(input.mrp) || input.mrp <= 0)
    errors.mrp = "MRP must be greater than 0.";
  if (!errors.price && !errors.mrp && input.price > input.mrp)
    errors.price = "Selling price cannot exceed MRP.";
  if (!Number.isInteger(input.stock) || input.stock < 0)
    errors.stock = "Stock must be a whole number of 0 or more.";
  if (input.price > 10000000) errors.price = "Price looks unrealistic.";
  return { ok: Object.keys(errors).length === 0, errors };
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

/* -------------------------------- context ------------------------------- */

export const LOW_STOCK_THRESHOLD = 150;

interface VendorStore {
  products: Product[];
  adjustments: StockAdjustment[];
  profile: CompanyProfile;
  addProduct: (input: ProductInput) => { ok: boolean; errors: Record<string, string> };
  updateProduct: (id: string, input: ProductInput) => { ok: boolean; errors: Record<string, string> };
  deleteProduct: (id: string) => void;
  adjustStock: (
    productId: string,
    type: StockAdjustmentType,
    delta: number,
    note: string
  ) => { ok: boolean; error?: string };
  saveProfile: (profile: CompanyProfile) => { ok: boolean; errors: Record<string, string> };
}

const VendorContext = createContext<VendorStore | null>(null);

function nowStamp() {
  return new Date().toISOString();
}

export function VendorProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => getProducts().map((p) => ({ ...p })));
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>(() =>
    getStockAdjustments().map((a) => ({ ...a }))
  );
  const [profile, setProfile] = useState<CompanyProfile>(() => ({ ...getCompanyProfile() }));
  const [seq, setSeq] = useState(1007);
  const [adjSeq, setAdjSeq] = useState(3022);

  const addProduct = useCallback(
    (input: ProductInput) => {
      const result = validateProductInput(input);
      if (!result.ok) return result;
      const id = `P-${seq}`;
      setSeq((s) => s + 1);
      const product: Product = {
        id,
        name: input.name.trim(),
        category: input.category.trim(),
        price: Math.round(input.price),
        mrp: Math.round(input.mrp),
        stock: input.stock,
        status: input.status,
        rating: 0,
        unitsSold: 0,
        launchedAt: nowStamp().slice(0, 10),
        vendor: profile.companyName,
        image: input.image || "/products/placeholder.png",
      };
      setProducts((prev) => [product, ...prev]);
      if (input.stock > 0) {
        const adj: StockAdjustment = {
          id: `ADJ-${adjSeq}`,
          productId: id,
          productName: product.name,
          type: "restock",
          delta: input.stock,
          resultingStock: input.stock,
          note: "Initial stock on product creation",
          at: nowStamp(),
        };
        setAdjSeq((s) => s + 1);
        setAdjustments((prev) => [adj, ...prev]);
      }
      return result;
    },
    [seq, adjSeq, profile.companyName]
  );

  const updateProduct = useCallback((id: string, input: ProductInput) => {
    const result = validateProductInput(input);
    if (!result.ok) return result;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              name: input.name.trim(),
              category: input.category.trim(),
              price: Math.round(input.price),
              mrp: Math.round(input.mrp),
              stock: input.stock,
              status: input.status,
              image: input.image || p.image,
            }
          : p
      )
    );
    return result;
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const adjustStock = useCallback(
    (productId: string, type: StockAdjustmentType, delta: number, note: string) => {
      if (!Number.isInteger(delta) || delta === 0)
        return { ok: false, error: "Quantity must be a non-zero whole number." };
      const product = products.find((p) => p.id === productId);
      if (!product) return { ok: false, error: "Product not found." };
      const signed = type === "restock" ? Math.abs(delta) : -Math.abs(delta);
      const resulting = product.stock + signed;
      if (resulting < 0)
        return {
          ok: false,
          error: `Cannot remove ${Math.abs(signed)} units — only ${product.stock} in stock.`,
        };
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, stock: resulting } : p))
      );
      const adj: StockAdjustment = {
        id: `ADJ-${adjSeq}`,
        productId,
        productName: product.name,
        type,
        delta: signed,
        resultingStock: resulting,
        note: note.trim() || "—",
        at: nowStamp(),
      };
      setAdjSeq((s) => s + 1);
      setAdjustments((prev) => [adj, ...prev]);
      return { ok: true };
    },
    [products, adjSeq]
  );

  const saveProfile = useCallback((next: CompanyProfile) => {
    const result = validateCompanyProfile(next);
    if (!result.ok) return result;
    setProfile({
      ...next,
      companyName: next.companyName.trim(),
      email: next.email.trim(),
      phone: validatePhone(next.phone).normalized ?? next.phone.trim(),
      gstin: next.gstin.trim().toUpperCase(),
      pan: next.pan.trim().toUpperCase(),
      ifsc: next.ifsc.trim().toUpperCase(),
    });
    return result;
  }, []);

  const value = useMemo(
    () => ({
      products,
      adjustments,
      profile,
      addProduct,
      updateProduct,
      deleteProduct,
      adjustStock,
      saveProfile,
    }),
    [products, adjustments, profile, addProduct, updateProduct, deleteProduct, adjustStock, saveProfile]
  );

  return <VendorContext.Provider value={value}>{children}</VendorContext.Provider>;
}

export function useVendorStore(): VendorStore {
  const ctx = useContext(VendorContext);
  if (!ctx) throw new Error("useVendorStore must be used inside <VendorProvider>");
  return ctx;
}
