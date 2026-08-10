"use client";

import { api } from "@/lib/api/client";

/* ---- Shared types ---- */

export type SaleStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "hold"
  | "clarification";

export type PaymentMode =
  | "cash"
  | "upi"
  | "bank_transfer"
  | "cheque"
  | "other";

/* ---- Field officer types ---- */

export type MySaleSubmission = {
  id: string;
  product_name: string;
  customer_name: string;
  customer_company: string | null;
  city: string | null;
  state: string | null;
  qty: number;
  unit_price: number;
  total_amount: number;
  status: SaleStatus;
  admin_note: string | null;
  invoice_ref: string | null;
  payment_mode: PaymentMode | null;
  created_at: string;
  reviewed_at: string | null;
};

export type MySalesResponse = {
  submissions: MySaleSubmission[];
  total: number;
  page: number;
  page_size: number;
};

/* ---- Admin types ---- */

export type AdminSaleSubmission = {
  id: string;
  officer_id: string;
  officer_name: string;
  product_id: string | null;
  product_name: string;
  customer_name: string;
  customer_company: string | null;
  customer_phone: string | null;
  city: string | null;
  state: string | null;
  qty: number;
  unit_price: number;
  total_amount: number;
  commission_rate: number;
  invoice_ref: string | null;
  payment_mode: PaymentMode | null;
  payment_ref: string | null;
  remarks: string | null;
  status: SaleStatus;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type AdminSalesResponse = {
  submissions: AdminSaleSubmission[];
  total: number;
  page: number;
  page_size: number;
  status: SaleStatus;
};

export type AdminKpis = {
  totalOfficers: number;
  liveProducts: number;
  pendingVerifications: number;
  totalCommission: number;
  pendingCommission: number;
  settledCommission: number;
};

/* ---- Request / response types ---- */

export type SubmitSaleInput = {
  product_id: string;
  customer_name: string;
  customer_company?: string;
  customer_phone?: string;
  city?: string;
  state?: string;
  qty: number;
  unit_price: number;
  invoice_ref?: string;
  payment_mode?: PaymentMode;
  payment_ref?: string;
  remarks?: string;
};

export type SubmitSaleResult = {
  submission_id: string;
  status: SaleStatus;
  message: string;
};

export type ReviewSaleInput = {
  action: "approve" | "reject" | "hold" | "clarification";
  note?: string;
};

export type ReviewSaleResult = {
  id: string;
  status: SaleStatus;
  order_id: string | null;
  message: string;
};

/* ---- API functions ---- */

/** FSO: submit a completed sale for admin verification */
export async function submitSale(input: SubmitSaleInput): Promise<SubmitSaleResult> {
  return api<SubmitSaleResult>("/api/field/sales", {
    method: "POST",
    body: input,
  });
}

/** Admin: approve / reject / hold / request clarification on a submission */
export async function reviewSale(
  id: string,
  input: ReviewSaleInput
): Promise<ReviewSaleResult> {
  return api<ReviewSaleResult>(`/api/admin/sales/${id}/review`, {
    method: "PATCH",
    body: input,
  });
}

/* ---- SWR cache keys ---- */

export const mySalesKey = (
  opts: { status?: SaleStatus; page?: number } = {}
) => {
  const p = new URLSearchParams();
  if (opts.status) p.set("status", opts.status);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/field/sales${qs ? `?${qs}` : ""}`;
};

export const adminSalesKey = (
  opts: { status?: SaleStatus; page?: number } = {}
) => {
  const p = new URLSearchParams();
  if (opts.status) p.set("status", opts.status);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/admin/sales${qs ? `?${qs}` : ""}`;
};

export const ADMIN_KPIS_KEY = "/api/admin/kpis";

export const STATUS_LABELS: Record<SaleStatus, string> = {
  pending:       "Pending Review",
  approved:      "Approved",
  rejected:      "Rejected",
  hold:          "On Hold",
  clarification: "Clarification Needed",
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash:          "Cash",
  upi:           "UPI",
  bank_transfer: "Bank Transfer",
  cheque:        "Cheque",
  other:         "Other",
};
