"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  IndianRupee,
  Loader2,
  MessageSquare,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  adminSalesKey,
  reviewSale,
  STATUS_LABELS,
  PAYMENT_MODE_LABELS,
  type AdminSaleSubmission,
  type AdminSalesResponse,
  type SaleStatus,
  type ReviewSaleInput,
} from "@/lib/api/sales";
import { formatINR } from "@/lib/utils";

const STATUS_BADGE: Record<SaleStatus, "default" | "success" | "destructive" | "outline" | "secondary"> = {
  pending:       "outline",
  approved:      "success",
  rejected:      "destructive",
  hold:          "secondary",
  clarification: "secondary",
};

const TAB_STATUSES: { label: string; value: SaleStatus }[] = [
  { label: "Pending",       value: "pending" },
  { label: "Approved",      value: "approved" },
  { label: "Rejected",      value: "rejected" },
  { label: "On Hold",       value: "hold" },
  { label: "Clarification", value: "clarification" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ActionButtons({
  sub,
  onDone,
}: {
  sub: AdminSaleSubmission;
  onDone: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function act(action: ReviewSaleInput["action"]) {
    if (submitting) return;
    setError(null);
    setSubmitting(action);
    try {
      const res = await reviewSale(sub.id, { action, note: note.trim() || undefined });
      setDone(res.message);
      setTimeout(onDone, 1400);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(null);
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {done}
      </div>
    );
  }

  if (sub.status !== "pending" && sub.status !== "hold" && sub.status !== "clarification") {
    return (
      <p className="text-xs text-muted-foreground">
        Finalised — no further action required.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Note (collapsible) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Add a note (optional)
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <textarea
              rows={2}
              placeholder="Note for the officer (shown on rejection/hold/clarification)…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => act("approve")}
          disabled={!!submitting}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {submitting === "approve" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => act("reject")}
          disabled={!!submitting}
        >
          {submitting === "reject" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          Reject
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => act("hold")}
          disabled={!!submitting}
        >
          {submitting === "hold" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Clock className="h-3.5 w-3.5" />
          )}
          Hold
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => act("clarification")}
          disabled={!!submitting}
        >
          {submitting === "clarification" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5" />
          )}
          Need Clarification
        </Button>
      </div>
    </div>
  );
}

function SubmissionCard({
  sub,
  onDone,
}: {
  sub: AdminSaleSubmission;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const commission = Math.round(sub.total_amount * sub.commission_rate * 100) / 100;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE[sub.status]}>{STATUS_LABELS[sub.status]}</Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {sub.id.slice(0, 8)}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(sub.created_at)}</span>
          </div>

          <p className="mt-1.5 font-medium leading-snug">
            {sub.product_name}{" "}
            <span className="text-muted-foreground font-normal">×{sub.qty}</span>
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
            <span className="font-semibold">{formatINR(sub.total_amount)}</span>
            <span className="text-muted-foreground text-xs">
              commission: {formatINR(commission)} ({Math.round(sub.commission_rate * 100)}%)
            </span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Officer: <span className="font-medium text-foreground">{sub.officer_name}</span>
            {" · "}
            Customer: <span className="font-medium text-foreground">{sub.customer_name}</span>
            {sub.customer_company ? ` (${sub.customer_company})` : ""}
            {sub.city ? ` · ${sub.city}${sub.state ? `, ${sub.state}` : ""}` : ""}
          </p>
        </div>

        <div className="shrink-0 pt-0.5">
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded detail + actions */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-4">
              {/* Details grid */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                {[
                  { label: "Product",         value: sub.product_name },
                  { label: "Qty",             value: sub.qty },
                  { label: "Unit price",      value: formatINR(sub.unit_price) },
                  { label: "Total amount",    value: formatINR(sub.total_amount) },
                  { label: "Commission",      value: `${formatINR(commission)} (${Math.round(sub.commission_rate * 100)}%)` },
                  { label: "Customer",        value: sub.customer_name },
                  { label: "Company",         value: sub.customer_company ?? "—" },
                  { label: "Phone",           value: sub.customer_phone ?? "—" },
                  { label: "Location",        value: [sub.city, sub.state].filter(Boolean).join(", ") || "—" },
                  { label: "Invoice ref",     value: sub.invoice_ref ?? "—" },
                  { label: "Payment mode",    value: sub.payment_mode ? PAYMENT_MODE_LABELS[sub.payment_mode] : "—" },
                  { label: "Payment ref",     value: sub.payment_ref ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="font-medium text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-foreground">{String(value)}</dd>
                  </div>
                ))}
              </dl>

              {sub.remarks && (
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="font-medium text-muted-foreground">Remarks: </span>
                  {sub.remarks}
                </div>
              )}

              {sub.admin_note && (
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  <span className="font-medium text-muted-foreground">Previous note: </span>
                  {sub.admin_note}
                </div>
              )}

              {/* Action buttons */}
              <ActionButtons sub={sub} onDone={onDone} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function VerificationsPage() {
  const { mutate } = useSWRConfig();
  const [status, setStatus] = useState<SaleStatus>("pending");
  const [page, setPage] = useState(1);

  const { data, error, isLoading } = useSWR<AdminSalesResponse>(
    adminSalesKey({ status, page }),
    apiFetcher,
    { refreshInterval: 30_000 } // poll every 30s so new submissions appear
  );

  function refresh() {
    mutate(adminSalesKey({ status, page }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Sales Verifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review sale submissions from field officers. Approve to create an order and release commission;
          reject, hold, or request clarification as needed.
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {TAB_STATUSES.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => { setStatus(value); setPage(1); }}
            className={[
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              status === value
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {label}
            {value === "pending" && data?.total && status === "pending"
              ? ` (${data.total})`
              : ""}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading submissions…</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Could not load submissions. Make sure the backend is running.
        </div>
      )}

      {data && data.submissions.length === 0 && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No {status} submissions</p>
          <p className="text-xs text-muted-foreground">
            {status === "pending"
              ? "No sales are waiting for review right now."
              : `No submissions with status "${STATUS_LABELS[status]}".`}
          </p>
        </div>
      )}

      {data && data.submissions.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {data.submissions.map((sub) => (
              <SubmissionCard key={sub.id} sub={sub} onDone={refresh} />
            ))}
          </div>

          {/* Pagination */}
          {data.total > data.page_size && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {(page - 1) * data.page_size + 1}–
                {Math.min(page * data.page_size, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page * data.page_size >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
