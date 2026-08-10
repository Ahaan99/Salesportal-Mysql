"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle, Bell, CalendarClock, CheckCircle2, Loader2,
  Mail, MessageSquare, Phone, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetcher } from "@/lib/api/client";
import {
  updateFollowUp,
  FOLLOWUP_TYPE_LABELS,
  FOLLOWUP_STATUS_LABELS,
  type FollowUp,
  type FollowUpStatus,
} from "@/lib/api/crm";

/* ─── Constants ───────────────────────────────────────────────── */

const STATUS_TABS: { label: string; value: FollowUpStatus | "all" }[] = [
  { label: "Pending", value: "pending" },
  { label: "Done",    value: "done" },
  { label: "Missed",  value: "missed" },
  { label: "All",     value: "all" },
];

const TYPE_ICON: Record<string, React.ReactNode> = {
  call:     <Phone className="h-4 w-4" />,
  visit:    <Bell className="h-4 w-4" />,
  whatsapp: <MessageSquare className="h-4 w-4" />,
  email:    <Mail className="h-4 w-4" />,
};

const STATUS_BADGE: Record<FollowUpStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending:   "default",
  done:      "secondary",
  missed:    "destructive",
  cancelled: "outline",
};

/* ─── Helpers ─────────────────────────────────────────────────── */

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function isPast(iso: string) {
  return new Date(iso) < new Date();
}

function followUpsKey(status: FollowUpStatus | "all", page = 1) {
  const p = new URLSearchParams();
  if (status !== "all") p.set("status", status);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return `/api/field/crm/follow-ups${qs ? `?${qs}` : ""}`;
}

/* ─── Types ───────────────────────────────────────────────────── */

type FollowUpWithLead = FollowUp & {
  leads?: { shop_name: string; owner_name: string } | null;
};

type FollowUpsResponse = {
  follow_ups: FollowUpWithLead[];
  total: number;
  page?: number;
  page_size?: number;
};

/* ─── FollowUpRow ─────────────────────────────────────────────── */

function FollowUpRow({
  fu,
  onRefresh,
}: {
  fu: FollowUpWithLead;
  onRefresh: () => void;
}) {
  const [acting, setActing] = useState(false);

  async function act(newStatus: FollowUpStatus) {
    setActing(true);
    try {
      await updateFollowUp(fu.id, {
        status: newStatus,
        ...(newStatus === "done" ? { completed_at: new Date().toISOString() } : {}),
      });
      onRefresh();
    } catch {
      /* noop */
    } finally {
      setActing(false);
    }
  }

  const overdue = fu.status === "pending" && isPast(fu.scheduled_at);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
        {TYPE_ICON[fu.type] ?? <Bell className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{FOLLOWUP_TYPE_LABELS[fu.type]}</span>
          <Badge variant={STATUS_BADGE[fu.status]}>
            {FOLLOWUP_STATUS_LABELS[fu.status]}
          </Badge>
          {fu.leads && (
            <Badge variant="outline">{fu.leads.shop_name}</Badge>
          )}
        </div>

        <p
          className={`mt-0.5 flex items-center gap-1 text-xs ${
            overdue
              ? "text-destructive font-medium"
              : "text-muted-foreground"
          }`}
        >
          <CalendarClock className="h-3 w-3" />
          {formatDateTime(fu.scheduled_at)}
          {overdue ? " — Overdue" : ""}
        </p>

        {fu.notes && (
          <p className="mt-1 text-xs text-muted-foreground">{fu.notes}</p>
        )}
      </div>

      {fu.status === "pending" && (
        <div className="flex shrink-0 gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={acting}
            onClick={() => act("done")}
            className="h-7 px-2 text-xs"
          >
            {acting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3 mr-1" />
            )}
            Done
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={acting}
            onClick={() => act("missed")}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            <XCircle className="h-3 w-3 mr-1" />
            Missed
          </Button>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Page ────────────────────────────────────────────────────── */

export default function FollowUpsPage() {
  const [tab, setTab] = useState<FollowUpStatus | "all">("pending");
  const [page, setPage] = useState(1);
  const { mutate } = useSWRConfig();

  const key = followUpsKey(tab, page);
  const { data, error, isLoading } = useSWR<FollowUpsResponse>(key, apiFetcher);

  function refresh() {
    mutate(key);
  }

  function onTabChange(t: FollowUpStatus | "all") {
    setTab(t);
    setPage(1);
  }

  const pageSize = data?.page_size ?? data?.follow_ups.length ?? 20;
  const total    = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      {/* Subtitle */}
      {data && (
        <p className="text-sm text-muted-foreground">
          {total} follow-up{total !== 1 ? "s" : ""}
        </p>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 rounded-xl bg-secondary p-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => onTabChange(t.value)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              tab === t.value
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-8 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error.message ?? "Could not load follow-ups."}
        </div>
      )}

      {/* Loading */}
      {isLoading && !data && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading follow-ups…
        </div>
      )}

      {/* Empty */}
      {!isLoading && data && data.follow_ups.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <CalendarClock className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            No {tab === "all" ? "" : tab + " "}follow-ups
          </p>
          <p className="text-xs text-muted-foreground">
            Schedule follow-ups from a lead&apos;s detail view.
          </p>
        </div>
      )}

      {/* List */}
      {data && data.follow_ups.length > 0 && (
        <AnimatePresence mode="popLayout">
          <div className="flex flex-col gap-3">
            {data.follow_ups.map((fu) => (
              <FollowUpRow key={fu.id} fu={fu} onRefresh={refresh} />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Pagination */}
      {data && total > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
            {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
