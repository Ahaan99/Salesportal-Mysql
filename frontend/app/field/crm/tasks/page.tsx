"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  Circle, ClipboardList, Loader2, Plus, Trash2, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  tasksKey, createTask, updateTask, deleteTask,
  TASK_PRIORITY_LABELS, TASK_STATUS_LABELS,
  type CrmTask, type TasksResponse, type TaskStatus, type TaskPriority,
} from "@/lib/api/crm";

const PRIORITY_BADGE: Record<TaskPriority, "destructive" | "default" | "outline"> = {
  high: "destructive", medium: "default", low: "outline",
};

const STATUS_TABS: { label: string; value: TaskStatus | "" }[] = [
  { label: "Pending", value: "pending" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "done" },
  { label: "All", value: "" },
];

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(due: string | null) {
  if (!due) return false;
  return new Date(due) < new Date();
}

/* ---- Add task modal ---- */
function AddTaskModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", due_date: "", priority: "medium" as TaskPriority });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await createTask({ ...form, description: form.description || undefined, due_date: form.due_date || undefined });
      onDone();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not create task."); }
    finally { setSaving(false); }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-background border border-border p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">New Task</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Title *</label>
            <Input value={form.title} onChange={set("title")} required placeholder="Follow up with Sharma Store" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea value={form.description} onChange={set("description")}
              placeholder="Additional details…"
              className="min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Due Date</label>
              <Input type="date" value={form.due_date} onChange={set("due_date")} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Priority</label>
              <select value={form.priority} onChange={set("priority")}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />{error}
            </div>
          )}
          <Button type="submit" disabled={saving} className="mt-1">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Create Task"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

/* ---- Task row ---- */
function TaskRow({ task, onRefresh }: { task: CrmTask; onRefresh: () => void }) {
  const [acting, setActing] = useState(false);
  const overdue = task.status !== "done" && isOverdue(task.due_date);

  async function toggle() {
    if (acting) return;
    setActing(true);
    try {
      const newStatus: TaskStatus = task.status === "done" ? "pending" : "done";
      await updateTask(task.id, { status: newStatus });
      onRefresh();
    } catch { /* ignore */ }
    finally { setActing(false); }
  }

  async function remove() {
    if (!confirm("Delete this task?")) return;
    try { await deleteTask(task.id); onRefresh(); } catch { /* ignore */ }
  }

  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className={`flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-opacity ${task.status === "done" ? "opacity-60" : ""}`}
    >
      <button type="button" onClick={toggle} disabled={acting}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
      >
        {acting ? <Loader2 className="h-5 w-5 animate-spin" /> : task.status === "done" ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
            {task.title}
          </span>
          <Badge variant={PRIORITY_BADGE[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
          {task.leads && <Badge variant="secondary">{task.leads.shop_name}</Badge>}
        </div>
        {task.description && <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>}
        {task.due_date && (
          <p className={`mt-1 text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            Due: {formatDate(task.due_date)}{overdue ? " — Overdue" : ""}
          </p>
        )}
      </div>
      <button type="button" onClick={remove} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
        <Trash2 className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

/* ---- Page ---- */
export default function TasksPage() {
  const { mutate } = useSWRConfig();
  const [tab, setTab]       = useState<TaskStatus | "">( "pending");
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage]     = useState(1);

  const key = tasksKey({ status: tab || undefined, page });
  const { data, error, isLoading } = useSWR<TasksResponse>(key, apiFetcher, { keepPreviousData: true });

  function refresh() { mutate(key); }
  function onAdded() { setShowAdd(false); mutate(key); }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ClipboardList className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">My Tasks</p>
            <p className="text-xs text-muted-foreground">{data ? `${data.total} task${data.total !== 1 ? "s" : ""}` : "Manage your to-dos"}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Add Task
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {STATUS_TABS.map(t => (
          <button key={t.value} type="button"
            onClick={() => { setTab(t.value as TaskStatus | ""); setPage(1); }}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              tab === t.value ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* Content */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-8 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{error.message}
        </div>
      )}
      {isLoading && !data && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />Loading tasks…
        </div>
      )}
      {data && data.tasks.length === 0 && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No {tab || ""} tasks</p>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" />Add Task
          </Button>
        </div>
      )}
      {data && data.tasks.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.tasks.map(t => <TaskRow key={t.id} task={t} onRefresh={refresh} />)}
        </div>
      )}

      {/* Pagination */}
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
        {showAdd && <AddTaskModal onClose={() => setShowAdd(false)} onDone={onAdded} />}
      </AnimatePresence>
    </div>
  );
}
