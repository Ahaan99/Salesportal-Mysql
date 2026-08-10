"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRightLeft,
  BadgeIndianRupee,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  IndianRupee,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/portal/stat-card";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  ADMIN_COMMISSIONS_SUMMARY_KEY,
  adminCommissionsKey,
  adminPayoutsKey,
  releaseCommission,
  settleCommission,
  reviewPayout,
  COMMISSION_STATUS_LABELS,
  PAYOUT_STATUS_LABELS,
  type Commission,
  type CommissionStatus,
  type CommissionSummary,
  type AdminCommissionsResponse,
  type PayoutRequest,
  type PayoutStatus,
  type PayoutsResponse,
} from "@/lib/api/commissions";
import { formatINR } from "@/lib/utils";

/* ---- helpers ---- */
function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const COMM_TAB: { label: string; value: CommissionStatus }[] = [
  { label: "Pending", value: "pending" },
  { label: "Available", value: "available" },
  { label: "Settled", value: "settled" },
];

const PAYOUT_TAB: { label: string; value: PayoutStatus }[] = [
  { label: "Pending",    value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Paid",       value: "paid" },
  { label: "Rejected",   value: "rejected" },
];

/* ---- Commission row ---- */
function CommissionRow({ comm, onDone }: { comm: Commission; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setActing(true); setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: "Done." });
      setTimeout(onDone, 1000);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Error." });
    } finally { setActing(false); }
  }

  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={comm.status === "settled" ? "success" : comm.status === "available" ? "default" : "outline"}>
              {COMMISSION_STATUS_LABELS[comm.status]}
            </Badge>
            <span className="text-xs font-mono text-muted-foreground">{comm.id.slice(0,8)}</span>
            <span className="text-xs text-muted-foreground">{formatDate(comm.created_at)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">{formatINR(comm.amount)}</span>
            <span className="text-muted-foreground">
              {comm.profiles?.full_name ?? comm.officer_id.slice(0,8)}
            </span>
            {comm.orders?.product_name && (
              <span className="text-muted-foreground">· {comm.orders.product_name} ×{comm.orders.qty}</span>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                {[
                  { label: "Officer",      value: comm.profiles?.full_name ?? "—" },
                  { label: "Phone",        value: comm.profiles?.phone ?? "—" },
                  { label: "Bank",         value: [comm.profiles?.bank_name, comm.profiles?.bank_account, comm.profiles?.bank_ifsc].filter(Boolean).join(" · ") || "—" },
                  { label: "Order",        value: comm.orders?.order_no ?? "—" },
                  { label: "Product",      value: comm.orders?.product_name ?? "—" },
                  { label: "Sale amount",  value: comm.orders?.amount != null ? formatINR(comm.orders.amount) : "—" },
                  { label: "Commission",   value: `${formatINR(comm.amount)} (${Math.round(comm.rate * 100)}%)` },
                  { label: "Settled at",   value: formatDate(comm.settled_at) },
                ].map(({ label, value }) => (
                  <div key={label}><dt className="font-medium text-muted-foreground">{label}</dt><dd className="mt-0.5">{value}</dd></div>
                ))}
              </dl>

              {msg && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-destructive/5 text-destructive"}`}>
                  {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {msg.text}
                </div>
              )}

              {comm.status === "pending" && (
                <Button size="sm" disabled={acting} onClick={() => act(() => releaseCommission(comm.id))} className="w-fit">
                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />}
                  Release to Available
                </Button>
              )}
              {comm.status === "available" && (
                <Button size="sm" disabled={acting} onClick={() => act(() => settleCommission(comm.id))} className="w-fit bg-green-600 hover:bg-green-700 text-white">
                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  Mark as Settled
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---- Payout row ---- */
function PayoutRow({ payout, onDone }: { payout: PayoutRequest; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [txRef, setTxRef] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(action: "approve" | "reject") {
    setActing(action); setMsg(null);
    try {
      await reviewPayout(payout.id, action, { transaction_ref: txRef.trim() || undefined, note: note.trim() || undefined });
      setMsg({ ok: true, text: action === "approve" ? "Payout approved and processed." : "Payout rejected." });
      setTimeout(onDone, 1200);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Error." });
    } finally { setActing(null); }
  }

  const badgeVariant = payout.status === "paid" ? "success" : payout.status === "rejected" ? "destructive" : "outline";

  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={badgeVariant}>{PAYOUT_STATUS_LABELS[payout.status]}</Badge>
            <span className="text-xs font-mono text-muted-foreground">{payout.id.slice(0,8)}</span>
            <span className="text-xs text-muted-foreground">{formatDate(payout.created_at)}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-sm">
            <span className="font-semibold">{formatINR(payout.amount)}</span>
            <span className="text-muted-foreground">{payout.profiles?.full_name ?? "—"}</span>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                {[
                  { label: "Officer",     value: payout.profiles?.full_name ?? "—" },
                  { label: "Phone",       value: payout.profiles?.phone ?? "—" },
                  { label: "Amount",      value: formatINR(payout.amount) },
                  { label: "UPI",         value: payout.upi_id ?? "—" },
                  { label: "Bank",        value: [payout.bank_name, payout.bank_account, payout.bank_ifsc].filter(Boolean).join(" · ") || "—" },
                  { label: "Remarks",     value: payout.remarks ?? "—" },
                  { label: "Admin note",  value: payout.admin_note ?? "—" },
                  { label: "Tx ref",      value: payout.transaction_ref ?? "—" },
                  { label: "Paid at",     value: formatDate(payout.paid_at) },
                ].map(({ label, value }) => (
                  <div key={label}><dt className="font-medium text-muted-foreground">{label}</dt><dd className="mt-0.5">{value}</dd></div>
                ))}
              </dl>

              {msg && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-destructive/5 text-destructive"}`}>
                  {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {msg.text}
                </div>
              )}

              {(payout.status === "pending" || payout.status === "processing") && (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Transaction ref (optional)</label>
                      <Input value={txRef} onChange={e => setTxRef(e.target.value)} placeholder="UTR / TxID" className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Note (optional)</label>
                      <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. reason for rejection" className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!!acting} onClick={() => act("approve")} className="bg-green-600 hover:bg-green-700 text-white">
                      {acting === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                      Approve & Pay
                    </Button>
                    <Button size="sm" variant="destructive" disabled={!!acting} onClick={() => act("reject")}>
                      {acting === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---- Main page ---- */
type View = "commissions" | "payouts";

export default function CommissionsPage() {
  const { mutate } = useSWRConfig();
  const [view, setView] = useState<View>("commissions");
  const [commStatus, setCommStatus] = useState<CommissionStatus>("pending");
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus>("pending");
  const [commPage, setCommPage] = useState(1);
  const [payoutPage, setPayoutPage] = useState(1);

  const { data: summary } = useSWR<CommissionSummary>(ADMIN_COMMISSIONS_SUMMARY_KEY, apiFetcher, { refreshInterval: 60_000 });

  const { data: comms, isLoading: commsLoading, error: commsError } = useSWR<AdminCommissionsResponse>(
    view === "commissions" ? adminCommissionsKey({ status: commStatus, page: commPage }) : null,
    apiFetcher, { keepPreviousData: true }
  );

  const { data: payouts, isLoading: payoutsLoading, error: payoutsError } = useSWR<PayoutsResponse>(
    view === "payouts" ? adminPayoutsKey({ status: payoutStatus, page: payoutPage }) : null,
    apiFetcher, { keepPreviousData: true }
  );

  function refreshAll() {
    mutate(ADMIN_COMMISSIONS_SUMMARY_KEY);
    mutate(adminCommissionsKey({ status: commStatus, page: commPage }));
    mutate(adminPayoutsKey({ status: payoutStatus, page: payoutPage }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Commission Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review officer commissions, release payouts, and settle earnings.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Earned" value={formatINR(summary.total)} icon={BadgeIndianRupee} />
          <StatCard label="Pending" value={formatINR(summary.pending)} icon={Clock} />
          <StatCard label="Available" value={formatINR(summary.available)} icon={IndianRupee} />
          <StatCard label="Settled" value={formatINR(summary.settled)} icon={CreditCard} />
        </div>
      )}

      {/* View switcher */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {(["commissions", "payouts"] as View[]).map(v => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              view === v ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v === "commissions" ? "Commissions" : "Payout Requests"}
          </button>
        ))}
      </div>

      {/* Commissions view */}
      {view === "commissions" && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {COMM_TAB.map(({ label, value }) => (
              <button key={value} type="button"
                onClick={() => { setCommStatus(value); setCommPage(1); }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  commStatus === value ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {commsLoading && <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}

          {commsError && !comms && (
            <p className="py-10 text-center text-sm text-destructive">
              Could not load commissions. Please try refreshing.
            </p>
          )}

          {comms && (
            <>
              <div className="flex flex-col gap-3">
                {comms.commissions.map(c => (
                  <CommissionRow key={c.id} comm={c} onDone={refreshAll} />
                ))}
              </div>
              {comms.commissions.length === 0 && !commsLoading && (
                <p className="py-10 text-center text-sm text-muted-foreground">No {commStatus} commissions.</p>
              )}
              {comms.total > comms.page_size && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{(commPage-1)*comms.page_size+1}–{Math.min(commPage*comms.page_size,comms.total)} of {comms.total}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" disabled={commPage<=1} onClick={() => setCommPage(p=>p-1)}>Previous</Button>
                    <Button size="sm" variant="ghost" disabled={commPage*comms.page_size>=comms.total} onClick={() => setCommPage(p=>p+1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Payouts view */}
      {view === "payouts" && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {PAYOUT_TAB.map(({ label, value }) => (
              <button key={value} type="button"
                onClick={() => { setPayoutStatus(value); setPayoutPage(1); }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  payoutStatus === value ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {payoutsLoading && <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}

          {payoutsError && !payouts && (
            <p className="py-10 text-center text-sm text-destructive">
              Could not load payout requests. Please try refreshing.
            </p>
          )}

          {payouts && (
            <>
              <div className="flex flex-col gap-3">
                {payouts.payouts.map(p => (
                  <PayoutRow key={p.id} payout={p} onDone={refreshAll} />
                ))}
              </div>
              {payouts.payouts.length === 0 && !payoutsLoading && (
                <p className="py-10 text-center text-sm text-muted-foreground">No {payoutStatus} payout requests.</p>
              )}
              {payouts.total > payouts.page_size && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{(payoutPage-1)*payouts.page_size+1}–{Math.min(payoutPage*payouts.page_size,payouts.total)} of {payouts.total}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" disabled={payoutPage<=1} onClick={() => setPayoutPage(p=>p-1)}>Previous</Button>
                    <Button size="sm" variant="ghost" disabled={payoutPage*payouts.page_size>=payouts.total} onClick={() => setPayoutPage(p=>p+1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
