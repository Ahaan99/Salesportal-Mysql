import { api } from "@/lib/api/client";

/* ---- Shared types ---- */

export type CommissionStatus = "pending" | "available" | "settled";
export type PayoutStatus = "pending" | "processing" | "paid" | "rejected";

/* ---- Commission types ---- */

export type Commission = {
  id: string;
  officer_id: string;
  rate: number;
  amount: number;
  status: CommissionStatus;
  settled_at: string | null;
  created_at: string;
  orders?: {
    order_no: string;
    product_name: string;
    qty: number;
    amount: number;
    placed_at: string | null;
    customer_name: string | null;
  } | null;
  profiles?: {
    full_name: string;
    phone: string | null;
    bank_name: string | null;
    bank_account: string | null;
    bank_ifsc: string | null;
  } | null;
};

export type AdminCommissionsResponse = {
  commissions: Commission[];
  total: number;
  page: number;
  page_size: number;
};

export type CommissionSummary = {
  pending: number;
  available: number;
  settled: number;
  total: number;
};

/* ---- Payout types ---- */

export type PayoutRequest = {
  id: string;
  officer_id: string;
  amount: number;
  bank_name: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  remarks: string | null;
  status: PayoutStatus;
  admin_note: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  transaction_ref: string | null;
  created_at: string;
  profiles?: { full_name: string; phone: string | null } | null;
};

export type PayoutsResponse = {
  payouts: PayoutRequest[];
  total: number;
  page: number;
  page_size: number;
};

/* ---- Wallet types ---- */

export type WalletSummary = {
  pending_amount: number;
  available_amount: number;
  withdrawn_amount: number;
  total_earned: number;
  updated_at: string | null;
};

export type WalletResponse = {
  wallet: WalletSummary;
  recent_commissions: Commission[];
  recent_payouts: PayoutRequest[];
};

/* ---- Request types ---- */

export type RequestPayoutInput = {
  amount: number;
  bank_name?: string;
  bank_account?: string;
  bank_ifsc?: string;
  upi_id?: string;
  remarks?: string;
};

/* ---- API functions ---- */

export async function releaseCommission(id: string): Promise<{ id: string; status: CommissionStatus }> {
  return api(`/api/admin/commissions/${id}/status`, { method: "PATCH", body: { action: "release" } });
}

export async function settleCommission(id: string): Promise<{ id: string; status: CommissionStatus }> {
  return api(`/api/admin/commissions/${id}/status`, { method: "PATCH", body: { action: "settle" } });
}

export async function reviewPayout(
  id: string,
  action: "approve" | "reject",
  opts?: { transaction_ref?: string; note?: string }
): Promise<{ id: string; status: PayoutStatus }> {
  return api(`/api/admin/commissions/payouts/${id}/review`, {
    method: "PATCH",
    body: { action, ...opts },
  });
}

export async function requestPayout(input: RequestPayoutInput): Promise<{ payout_id: string; amount: number; message: string }> {
  return api("/api/field/wallet/payout", { method: "POST", body: input });
}

/* ---- SWR cache keys ---- */

export const ADMIN_COMMISSIONS_SUMMARY_KEY = "/api/admin/commissions/summary";

export const adminCommissionsKey = (opts: { status?: CommissionStatus; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status) p.set("status", opts.status);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/admin/commissions${qs ? `?${qs}` : ""}`;
};

export const adminPayoutsKey = (opts: { status?: PayoutStatus; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status) p.set("status", opts.status);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/admin/commissions/payouts${qs ? `?${qs}` : ""}`;
};

export const WALLET_KEY = "/api/field/wallet";

/* ---- Label maps ---- */

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  pending:   "Pending",
  available: "Available",
  settled:   "Settled",
};

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending:    "Pending",
  processing: "Processing",
  paid:       "Paid",
  rejected:   "Rejected",
};
