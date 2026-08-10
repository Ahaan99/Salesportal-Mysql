"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Plus,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  leadsKey,
  createLead,
  updateLead,
  deleteLead,
  createNote,
  POTENTIAL_LABELS,
  STATUS_LABELS,
  type Lead,
  type LeadsResponse,
  type LeadPotential,
  type LeadStatus,
} from "@/lib/api/crm";

const POTENTIAL_BADGE: Record<LeadPotential, "destructive" | "default" | "outline"> = {
  hot: "destructive",
  warm: "default",
  cold: "outline",
};

const STATUS_FILTER: { label: string; value: LeadStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "New", value: "new" },
  { label: "Contacted", value: "contacted" },
  { label: "Interested", value: "interested" },
  { label: "Converted", value: "converted" },
];

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ---- Add Lead modal ---- */
function AddLeadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ shop_name: "", owner_name: "", phone: "", area: "", city: "", potential: "warm" as LeadPotential });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await createLead({ ...form, phone: form.phone || undefined, area: form.area || undefined, city: form.city || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create lead.");
    } finally { setSaving(false); }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-background border border-border p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Add Lead</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Shop Name *</label>
              <Input value={form.shop_name} onChange={set("shop_name")} required placeholder="Sharma General Store" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Owner Name *</label>
              <Input value={form.owner_name} onChange={set("owner_name")} required placeholder="Ramesh Sharma" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Phone</label>
              <Input value={form.phone} onChange={set("phone")} placeholder="+91 9876543210" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Potential</label>
              <select value={form.potential} onChange={set("potential")}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="hot">🔥 Hot</option>
                <option value="warm">🌡 Warm</option>
                <option value="cold">🧊 Cold</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Area</label>
              <Input value={form.area} onChange={set("area")} placeholder="Koregaon Park" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">City</label>
              <Input value={form.city} onChange={set("city")} placeholder="Pune" />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />{error}
            </div>
          )}
          <Button type="submit" disabled={saving} className="mt-1">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Add Lead"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

/* ---- Lead card ---- */
function LeadCard({ lead, onRefresh }: { lead: Lead; onRefresh: () => void }) {
  const [open, setOpen]       = useState(false);
  const [noteText, setNote]   = useState("");
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);

  async function logVisit() {
    setSaving(true); setMsg(null);
    try {
      await updateLead(lead.id, {
        status: lead.status === "new" ? "contacted" : lead.status,
        last_contact_at: new Date().toISOString(),
      });
      setMsg("Visit logged!");
      setTimeout(() => { setMsg(null); onRefresh(); }, 1200);
    } catch { setMsg("Failed."); }
    finally { setSaving(false); }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await createNote(lead.id, noteText.trim());
      setNote("");
      setMsg("Note saved.");
      setTimeout(() => setMsg(null), 1200);
    } catch { setMsg("Could not save note."); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!confirm("Delete this lead?")) return;
    try { await deleteLead(lead.id); onRefresh(); } catch { /* ignore */ }
  }

  return (
    <motion.article layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md"
    >
      {/* Header row */}
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-start gap-4 p-5 text-left hover:bg-muted/20 transition-colors"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <Store className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{lead.shop_name}</span>
            <Badge variant={POTENTIAL_BADGE[lead.potential]}>{POTENTIAL_LABELS[lead.potential]}</Badge>
            <Badge variant="secondary">{STATUS_LABELS[lead.status]}</Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Owner: {lead.owner_name}</span>
            {(lead.area || lead.city) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />{[lead.area, lead.city].filter(Boolean).join(", ")}
              </span>
            )}
            {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
          </p>
          {lead.last_contact_at && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="h-3 w-3" />Last contact: {formatDate(lead.last_contact_at)}
            </p>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground mt-1" /> : <ChevronDown className="h-4 w-4 text-muted-foreground mt-1" />}
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="flex flex-col gap-4 p-5">
              {/* Suggested products */}
              {lead.suggested_products.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Suggested products</p>
                  <p className="text-sm">{lead.suggested_products.join(", ")}</p>
                </div>
              )}
              {/* Existing notes */}
              {lead.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-muted-foreground">{lead.notes}</p>
                </div>
              )}
              {/* Status select */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground">Status:</label>
                <select
                  defaultValue={lead.status}
                  onChange={async e => {
                    try { await updateLead(lead.id, { status: e.target.value as LeadStatus }); onRefresh(); }
                    catch { /* ignore */ }
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              {/* Add note form */}
              <form onSubmit={addNote} className="flex gap-2">
                <Input
                  value={noteText}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a quick note…"
                  className="text-sm"
                />
                <Button type="submit" size="sm" variant="outline" disabled={saving || !noteText.trim()}>
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
              </form>
              {/* Feedback */}
              {msg && (
                <p className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />{msg}
                </p>
              )}
              {/* Actions */}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={logVisit} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log Visit"}
                </Button>
                <Button size="sm" variant="ghost" onClick={remove} className="text-destructive hover:text-destructive ml-auto">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/* ---- Page ---- */
export default function LeadsPage() {
  const { mutate } = useSWRConfig();
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);

  const key = leadsKey({ status: statusFilter || undefined, page });
  const { data, error, isLoading } = useSWR<LeadsResponse>(key, apiFetcher, { keepPreviousData: true });

  function refresh() { mutate(key); }
  function onLeadAdded() { setShowAdd(false); mutate(key); }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Navigation className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Your Leads</p>
            <p className="text-xs text-muted-foreground">
              {data ? `${data.total} lead${data.total !== 1 ? "s" : ""} tracked` : "Track and convert your prospects"}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Add Lead
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER.map(f => (
          <button key={f.value} type="button"
            onClick={() => { setStatusFilter(f.value as LeadStatus | ""); setPage(1); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >{f.label}</button>
        ))}
      </div>

      {/* Content */}
      {error && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Could not load leads.</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </div>
      )}

      {isLoading && !data && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />Loading leads…
        </div>
      )}

      {data && data.leads.length === 0 && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <Store className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No leads yet</p>
          <p className="text-xs text-muted-foreground">Tap "Add Lead" to start tracking your prospects.</p>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Add your first lead
          </Button>
        </div>
      )}

      {data && data.leads.length > 0 && (
        <div className="flex flex-col gap-4">
          {data.leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onRefresh={refresh} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > data.page_size && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)} of {data.total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="ghost" disabled={page * data.page_size >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Add Lead modal */}
      <AnimatePresence>
        {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onDone={onLeadAdded} />}
      </AnimatePresence>
    </div>
  );
}
