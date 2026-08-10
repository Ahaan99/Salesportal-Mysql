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
  FileText,
  Loader2,
  ShieldCheck,
  ShieldX,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  adminKycKey,
  fetchAdminKyc,
  adminReviewKyc,
  DOC_TYPE_LABELS,
  type AdminKycItem,
  type AdminKycListResponse,
  type KycStatus,
  type DocType,
} from "@/lib/api/kyc";
import { apiFetcher } from "@/lib/api/client";

const TAB_STATUSES: { label: string; value: KycStatus }[] = [
  { label: "Pending",  value: "pending"  },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Draft",    value: "draft"    },
];

const STATUS_BADGE: Record<KycStatus, "default" | "success" | "destructive" | "outline" | "secondary"> = {
  draft:    "secondary",
  pending:  "outline",
  approved: "success",
  rejected: "destructive",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface ReviewPanelProps {
  item: AdminKycItem;
  onDone: () => void;
}

function ReviewPanel({ item, onDone }: ReviewPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Fetch detail (documents) when expanded
  const { data: detail } = useSWR(
    expanded ? `/api/admin/kyc/${item.id}` : null,
    (url: string) => apiFetcher<{ submission: unknown; documents: Array<{ id: string; doc_type: DocType; file_name: string; file_size: number }>; profile: unknown }>(url)
  );

  async function handleReview(act: "approve" | "reject") {
    if (act === "reject" && !reason.trim()) {
      setError("Please provide a rejection reason.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await adminReviewKyc(item.id, act, act === "reject" ? reason.trim() : undefined);
      setDone(act === "approve" ? "Approved successfully." : "Rejected with reason.");
      setTimeout(onDone, 1400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {done}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Documents (expandable) */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <FileText className="h-3.5 w-3.5" />
        {item.doc_count} document{item.doc_count !== 1 ? "s" : ""} uploaded
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
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              {!detail ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading documents…
                </div>
              ) : detail.documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {detail.documents.map(doc => (
                    <li key={doc.id} className="flex items-center gap-2 text-xs">
                      <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{DOC_TYPE_LABELS[doc.doc_type]}</span>
                      <span className="text-muted-foreground truncate">— {doc.file_name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      {(item.status === "pending") && (
        <div className="flex flex-col gap-2">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          {action === "reject" && (
            <div className="flex gap-2">
              <Input
                placeholder="Rejection reason (required)"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={loading}
              onClick={() => {
                setAction("approve");
                handleReview("approve");
              }}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {loading && action === "approve" ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Approving…</>
              ) : (
                <><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Approve</>
              )}
            </Button>

            {action !== "reject" ? (
              <Button size="sm" variant="outline" onClick={() => setAction("reject")}
                className="border-destructive/30 text-destructive hover:bg-destructive/5">
                <ShieldX className="mr-1.5 h-3.5 w-3.5" />Reject
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                disabled={loading || !reason.trim()}
                onClick={() => handleReview("reject")}
              >
                {loading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Rejecting…</> : "Confirm Reject"}
              </Button>
            )}
          </div>
        </div>
      )}

      {item.status === "rejected" && item.rejection_reason && (
        <p className="text-xs text-muted-foreground italic">
          <span className="font-medium text-destructive">Reason:</span> {item.rejection_reason}
        </p>
      )}
    </div>
  );
}

export default function AdminKycPage() {
  const [activeStatus, setActiveStatus] = useState<KycStatus>("pending");
  const [page, setPage] = useState(1);
  const { mutate } = useSWRConfig();

  const swrKey = adminKycKey(activeStatus, page);
  const { data, isLoading, error } = useSWR<AdminKycListResponse>(swrKey, fetchAdminKyc);

  function handleDone() {
    mutate(swrKey);
  }

  const submissions = data?.submissions ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="flex flex-col gap-3 rounded-xl bg-ink p-6 text-ink-foreground md:flex-row md:items-center md:justify-between md:p-8">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-serif text-2xl tracking-tight">KYC Review Queue</h2>
            <p className="text-sm text-ink-muted">
              Review and approve KYC submissions from field officers and vendors
            </p>
          </div>
        </div>
      </section>

      {/* Status Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
        {TAB_STATUSES.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setActiveStatus(tab.value); setPage(1); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeStatus === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading submissions…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center text-sm text-destructive">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 opacity-60" />
          Could not load KYC submissions. Please refresh.
        </div>
      ) : submissions.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border py-20 text-center">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium text-muted-foreground">No {activeStatus} submissions</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            {activeStatus === "pending" ? "All caught up — nothing to review." : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
            >
              <Card>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    {/* Info */}
                    <div className="flex gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <User className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {item.profile?.full_name ?? "Unknown user"}
                          </p>
                          <Badge variant={STATUS_BADGE[item.status]}>{item.status}</Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.user_role === "field" ? "Field Officer" : "Vendor"}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {item.profile?.phone && <span>{item.profile.phone}</span>}
                          {item.profile?.city && (
                            <span>
                              {item.profile.city}
                              {item.profile.state ? `, ${item.profile.state}` : ""}
                            </span>
                          )}
                          {item.submitted_at && (
                            <span>Submitted {formatDate(item.submitted_at)}</span>
                          )}
                          {item.reviewed_at && (
                            <span>Reviewed {formatDate(item.reviewed_at)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="min-w-[280px] md:max-w-sm">
                      <ReviewPanel item={item} onDone={handleDone} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
