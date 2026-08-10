"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  AlertCircle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  IndianRupee,
  Loader2,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/portal/stat-card";
import { apiFetcher, api, ApiError } from "@/lib/api/client";
import {
  SUMMARY_KEY,
  commissionsKey,
  type CommissionsResponse,
  type FieldSummary,
} from "@/lib/api/field";
import { cn, formatINR } from "@/lib/utils";

/* ---- types ---- */
type OfficerWallet = {
  officer_id: string;
  pending_amount: number;
  available_amount: number;
  withdrawn_amount: number;
  updated_at: string;
};
type PayoutRequest = {
  id: string;
  amount: number;
  status: "pending" | "approved" | "rejected" | "paid";
  requested_at: string;
  reviewed_at: string | null;
  notes: string | null;
};
type WalletResponse = {
  wallet: OfficerWallet;
  recent_payouts: PayoutRequest[];
};

const WALLET_KEY = "/api/field/wallet";

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "settled", label: "Settled" },
] as const;

const PAYOUT_BADGE: Record<PayoutRequest["status"], "default" | "destructive" | "secondary" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  paid: "default",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ---- Request Payout modal ---- */
function PayoutModal({
  available,
  onClose,
  onDone,
}: {
  available: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(available > 0 ? available : ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    if (amt > available) { setError(`Maximum available is ${formatINR(available)}.`); return; }
    setSaving(true); setError(null);
    try {
      await api("/api/field/wallet/payout", { method: "POST", body: { amount: amt } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit payout request.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-background border border-border p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Request Payout</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Available for payout: <span className="font-medium text-foreground">{formatINR(available)}</span>
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Amount (₹)</label>
            <Input
              type="number"
              min="1"
              step="0.01"
              max={available}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              placeholder={`Up to ${formatINR(available)}`}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}
          <Button type="submit" disabled={saving || available <= 0}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting…</> : "Request Payout"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

/* ---- Page ---- */
export default function FieldEarningsPage() {
  const { mutate } = useSWRConfig();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showPayout, setShowPayout] = useState(false);

  const { data: summary } = useSWR<FieldSummary>(SUMMARY_KEY, apiFetcher);
  const { data: walletData, mutate: mutateWallet } = useSWR<WalletResponse>(WALLET_KEY, apiFetcher);
  const { data, error, isLoading } = useSWR<CommissionsResponse>(
    commissionsKey({ status, page }),
    apiFetcher,
    { keepPreviousData: true }
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const wallet = walletData?.wallet;

  function onPayoutDone() {
    setShowPayout(false);
    mutateWallet();
    mutate(SUMMARY_KEY);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Commission summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          index={0}
          label="Earned this month"
          value={summary ? formatINR(summary.commission_month) : "—"}
          hint="Commission on this month's orders"
          icon={IndianRupee}
        />
        <StatCard
          index={1}
          label="Pending settlement"
          value={summary ? formatINR(summary.commission_pending) : "—"}
          hint="Awaiting admin verification"
          icon={Clock}
        />
        <StatCard
          index={2}
          label="Settled all-time"
          value={summary ? formatINR(summary.commission_settled) : "—"}
          hint="Total commissions released"
          icon={Wallet}
        />
      </div>

      {/* Wallet balance card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Wallet className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold">Wallet</h2>
          </div>
          <Button
            size="sm"
            disabled={!wallet || wallet.available_amount <= 0}
            onClick={() => setShowPayout(true)}
          >
            <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />
            Request Payout
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Pending Release</p>
            <p className="mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400">
              {wallet ? formatINR(wallet.pending_amount) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Awaiting admin release</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Available for Payout</p>
            <p className="mt-1 text-xl font-semibold text-green-600 dark:text-green-400">
              {wallet ? formatINR(wallet.available_amount) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Ready to withdraw</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Withdrawn</p>
            <p className="mt-1 text-xl font-semibold">
              {wallet ? formatINR(wallet.withdrawn_amount) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Paid out to date</p>
          </div>
        </div>

        {/* Recent payout requests */}
        {walletData?.recent_payouts && walletData.recent_payouts.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Recent payout requests</p>
            <div className="flex flex-col gap-2">
              {walletData.recent_payouts.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={PAYOUT_BADGE[p.status]}>{p.status}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(p.requested_at)}</span>
                  </div>
                  <span className="font-medium">{formatINR(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Commission history */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter commissions">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => { setStatus(f.value); setPage(1); }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              status === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={status === f.value}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
          <p className="text-sm font-medium">Could not load your commissions.</p>
          <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
        </div>
      ) : isLoading && !data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : data && data.commissions.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          {status ? `No ${status} commissions yet.` : "No commissions yet — place your first order to start earning."}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Order</th>
                  <th scope="col" className="px-4 py-3 font-medium">Product</th>
                  <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Order value</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Rate</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Commission</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Settled</th>
                </tr>
              </thead>
              <tbody>
                {data?.commissions.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.order_no ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-4 py-3">{c.product_name ?? "—"}</td>
                    <td className="max-w-[140px] truncate px-4 py-3 text-muted-foreground">{c.customer_name ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{c.order_amount != null ? formatINR(c.order_amount) : "—"}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{(Number(c.rate) * 100).toFixed(0)}%</td>
                    <td className="px-4 py-3 text-right font-medium">{formatINR(c.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.status === "settled" ? "default" : "accent"}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(c.settled_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-3 md:hidden">
            {data?.commissions.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-muted-foreground">{c.order_no ?? "—"}</span>
                  <Badge variant={c.status === "settled" ? "default" : "accent"}>{c.status}</Badge>
                </div>
                <p className="truncate text-sm font-medium">{c.product_name ?? "—"}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-muted-foreground">
                    {c.order_amount != null ? `${formatINR(c.order_amount)} order` : "—"} · {(Number(c.rate) * 100).toFixed(0)}%
                  </span>
                  <span className="font-serif text-lg">{formatINR(c.amount)}</span>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Commission pages">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isLoading}>
                <ChevronLeft className="h-4 w-4" aria-hidden />Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isLoading}>
                Next<ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}

      <AnimatePresence>
        {showPayout && wallet && (
          <PayoutModal
            available={wallet.available_amount}
            onClose={() => setShowPayout(false)}
            onDone={onPayoutDone}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
