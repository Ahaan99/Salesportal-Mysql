"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle, Calendar, CalendarClock, CheckCircle2,
  Clock, Loader2, MapPin, Plus, Trash2, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  meetingsKey, createMeeting, updateMeeting, deleteMeeting,
  MEETING_STATUS_LABELS,
  type Meeting, type MeetingsResponse, type MeetingStatus,
} from "@/lib/api/crm";

const STATUS_BADGE: Record<MeetingStatus, "default" | "success" | "destructive" | "outline"> = {
  scheduled: "default", completed: "success", cancelled: "destructive", no_show: "outline",
};

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "All", value: "" },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ---- Add meeting modal ---- */
function AddMeetingModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    title: "", customer_name: "", location: "", scheduled_at: "", duration_minutes: "30", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await createMeeting({
        title: form.title,
        scheduled_at: form.scheduled_at,
        customer_name: form.customer_name || undefined,
        location: form.location || undefined,
        duration_minutes: parseInt(form.duration_minutes, 10) || 30,
        notes: form.notes || undefined,
      });
      onDone();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not create meeting."); }
    finally { setSaving(false); }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-background border border-border p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Schedule Meeting</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Meeting Title *</label>
            <Input value={form.title} onChange={set("title")} required placeholder="Product demo with client" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Customer Name</label>
              <Input value={form.customer_name} onChange={set("customer_name")} placeholder="Ramesh Sharma" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Duration (min)</label>
              <Input type="number" min="5" max="480" value={form.duration_minutes} onChange={set("duration_minutes")} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Date & Time *</label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={set("scheduled_at")} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Location</label>
            <Input value={form.location} onChange={set("location")} placeholder="Shop address or online" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea value={form.notes} onChange={set("notes")} placeholder="Agenda, topics to cover…"
              className="min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />{error}
            </div>
          )}
          <Button type="submit" disabled={saving} className="mt-1">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Schedule Meeting"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

/* ---- Meeting card ---- */
function MeetingCard({ meeting, onRefresh }: { meeting: Meeting; onRefresh: () => void }) {
  const [acting, setActing] = useState(false);

  async function markStatus(status: MeetingStatus) {
    if (acting) return;
    setActing(true);
    try { await updateMeeting(meeting.id, { status }); onRefresh(); }
    catch { /* ignore */ }
    finally { setActing(false); }
  }

  async function remove() {
    if (!confirm("Delete this meeting?")) return;
    try { await deleteMeeting(meeting.id); onRefresh(); } catch { /* ignore */ }
  }

  const isPast = new Date(meeting.scheduled_at) < new Date();

  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <Calendar className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{meeting.title}</span>
            <Badge variant={STATUS_BADGE[meeting.status]}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />{formatDateTime(meeting.scheduled_at)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />{meeting.duration_minutes} min
            </span>
            {meeting.customer_name && <span>{meeting.customer_name}</span>}
            {meeting.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />{meeting.location}
              </span>
            )}
            {meeting.leads && <span>· {meeting.leads.shop_name}</span>}
          </div>
          {meeting.notes && <p className="mt-1 text-xs text-muted-foreground">{meeting.notes}</p>}
        </div>
        <button type="button" onClick={remove} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Actions for scheduled meetings */}
      {meeting.status === "scheduled" && isPast && (
        <div className="flex gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" className="flex-1" disabled={acting}
            onClick={() => markStatus("completed")}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-500" />Completed
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={acting}
            onClick={() => markStatus("no_show")}>No Show
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" disabled={acting}
            onClick={() => markStatus("cancelled")}>Cancel
          </Button>
        </div>
      )}
      {meeting.status === "scheduled" && !isPast && (
        <div className="flex gap-2 border-t border-border pt-3">
          <Button size="sm" variant="ghost" className="text-destructive ml-auto" disabled={acting}
            onClick={() => markStatus("cancelled")}>Cancel Meeting
          </Button>
        </div>
      )}
    </motion.div>
  );
}

/* ---- Page ---- */
export default function MeetingsPage() {
  const { mutate } = useSWRConfig();
  const [tab, setTab]         = useState("upcoming");
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage]       = useState(1);

  const isUpcoming = tab === "upcoming";
  const statusFilter = tab === "upcoming" ? undefined : (tab as MeetingStatus | undefined);

  const key = meetingsKey({ status: statusFilter, upcoming: isUpcoming, page });
  const { data, error, isLoading } = useSWR<MeetingsResponse>(key, apiFetcher, { keepPreviousData: true });

  function refresh() { mutate(key); }
  function onAdded()  { setShowAdd(false); mutate(key); }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Calendar className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Meetings</p>
            <p className="text-xs text-muted-foreground">{data ? `${data.total} meeting${data.total !== 1 ? "s" : ""}` : "Schedule and track meetings"}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Schedule
        </Button>
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {STATUS_TABS.map(t => (
          <button key={t.value} type="button"
            onClick={() => { setTab(t.value); setPage(1); }}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              tab === t.value ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>{t.label}</button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-8 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{error.message}
        </div>
      )}
      {isLoading && !data && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />Loading meetings…
        </div>
      )}
      {data && data.meetings.length === 0 && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No meetings</p>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" />Schedule a meeting
          </Button>
        </div>
      )}
      {data && data.meetings.length > 0 && (
        <div className="flex flex-col gap-4">
          {data.meetings.map(m => <MeetingCard key={m.id} meeting={m} onRefresh={refresh} />)}
        </div>
      )}

      {data && data.total > data.page_size && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)} of {data.total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <Button size="sm" variant="ghost" disabled={page * data.page_size >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showAdd && <AddMeetingModal onClose={() => setShowAdd(false)} onDone={onAdded} />}
      </AnimatePresence>
    </div>
  );
}
