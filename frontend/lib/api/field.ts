"use client";

import { api } from "@/lib/api/client";

/**
 * Typed client for the Field Officer API (backend /api/field/*).
 * Every endpoint is scoped server-side to the signed-in officer,
 * so no ids are ever passed from the browser.
 */

/* -------------------------------- types -------------------------------- */

export type FieldProfile = {
  user_id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  address: string | null;
  photo_url: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  monthly_target: number | null;
  joined_at: string;
};

export type FieldProduct = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  price: number;
  mrp: number | null;
  stock: number;
  images: string[] | null;
  rating: number | null;
  sku: string | null;
  created_at: string;
  category: string | null;
};

export type FieldOrder = {
  id: string;
  order_no: string;
  product_name: string;
  customer_name: string;
  customer_phone: string | null;
  city: string | null;
  state: string | null;
  status: "processing" | "packed" | "in-transit" | "delivered" | "cancelled" | "returned";
  qty: number;
  unit_price: number;
  amount: number;
  placed_at: string;
};

export type FieldCommission = {
  id: string;
  rate: number;
  amount: number;
  status: "pending" | "settled";
  settled_at: string | null;
  created_at: string;
  order_no: string | null;
  product_name: string | null;
  customer_name: string | null;
  qty: number | null;
  order_amount: number | null;
  placed_at: string | null;
};

export type FieldSummary = {
  sales_month: number;
  units_month: number;
  orders_month: number;
  commission_pending: number;
  commission_settled: number;
  commission_month: number;
  visits_today: number;
  visits_planned: number;
  monthly_target: number;
  region: string | null;
  region_rank: number | null;
  region_officers: number;
};

export type PerfPoint = {
  day?: string; // daily series
  month?: string; // monthly series
  orders: number;
  units: number;
  revenue: number;
  commission: number;
};

export type LeaderboardRow = {
  officer_id: string;
  name: string;
  city: string | null;
  region: string | null;
  sales: number;
  units: number;
  rank: number;
};

export type PlacedOrderLine = {
  id: string;
  order_no: string;
  product_name: string;
  qty: number;
  unit_price: number;
  amount: number;
  commission: number;
};

export type PlaceOrderResult = {
  ok: true;
  orders: PlacedOrderLine[];
  total_amount: number;
  commission_amount: number;
};

/* ------------------------------ SWR keys ------------------------------- */

export const PROFILE_KEY = "/api/field/profile";
export const SUMMARY_KEY = "/api/field/summary";

export const productsKey = (opts: { q?: string; sort?: string; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.q) p.set("q", opts.q);
  if (opts.sort) p.set("sort", opts.sort);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/field/products${qs ? `?${qs}` : ""}`;
};

export const ordersKey = (opts: { status?: string; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status) p.set("status", opts.status);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/field/orders${qs ? `?${qs}` : ""}`;
};

export const commissionsKey = (opts: { status?: string; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status) p.set("status", opts.status);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/field/commissions${qs ? `?${qs}` : ""}`;
};

export const performanceKey = (range: "daily" | "monthly", span?: number) =>
  `/api/field/performance?range=${range}${span ? `&span=${span}` : ""}`;

export const leaderboardKey = (region?: string | null) =>
  `/api/field/leaderboard${region ? `?region=${encodeURIComponent(region)}` : ""}`;

/* ------------------------------ mutations ------------------------------ */

export type ProfileInput = {
  full_name: string;
  phone?: string;
  city?: string;
  state?: string;
  region?: string;
  address?: string;
  photo_url?: string;
  bank_name?: string;
  bank_account?: string;
  bank_ifsc?: string;
};

export const saveProfile = (input: ProfileInput) =>
  api<{ ok: true; profile: FieldProfile }>(PROFILE_KEY, { method: "PUT", body: input });

export type PlaceOrderInput = {
  customer_name: string;
  customer_phone: string;
  city: string;
  state?: string;
  items: { product_id: string; qty: number }[];
};

export const placeOrder = (input: PlaceOrderInput) =>
  api<PlaceOrderResult>("/api/field/orders", { method: "POST", body: input });

/* ------------------------------ responses ------------------------------ */

export type ProfileResponse = { profile: FieldProfile | null };
export type ProductsResponse = { products: FieldProduct[]; total: number; page: number; pageSize: number };
export type OrdersResponse = { orders: FieldOrder[]; total: number; page: number; pageSize: number };
export type CommissionsResponse = { commissions: FieldCommission[]; total: number; page: number; pageSize: number };
export type PerformanceResponse = { range: "daily" | "monthly"; span: number; points: PerfPoint[] };
export type LeaderboardResponse = { leaderboard: LeaderboardRow[] };
