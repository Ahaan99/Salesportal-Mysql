"use client";

import Link from "next/link";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Bell,
  Calendar,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Loader2,
  MapPin,
  Phone,
  MessageSquare,
  Mail,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiFetcher } from "@/lib/api/client";
import {
  FOLLOWUP_TYPE_LABELS,
  FOLLOWUP_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type Lead,
  type FollowUp,
  type CrmTask,
  type Meeting,
  type LeadsResponse,
  type TasksResponse,
  type MeetingsResponse,
} from "@/lib/api/crm";

/* ─── Types ───────────────────────────────────────────────────── */

type FollowUpsResponse = {
  follow_ups: (FollowUp & { leads?: { shop_name: string } | null })[];
  total: number;
};

/* ─── Helpers ─────────────────────────────────────────────────── */

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function isPast(iso: string) {
  return new Date(iso) < new Date();
}

const POTENTIAL_COLOR: Record<string, string> = {
  hot:  "text-red-500",
  warm: "text-amber-500",
  cold: "text-blue-400",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  call:     <Phone className="h-3.5 w-3.5" />,
  visit:    <Bell className="h-3.5 w-3.5" />,
  whatsapp: <MessageSquare className="h-3.5 w-3.5" />,
  email:    <Mail className="h-3.5 w-3.5" />,
};

const PRIORITY_DOT: Record<string, string> = {
  high:   "bg-destructive",
  medium: "bg-amber-400",
  low:    "bg-muted-foreground/40",
};

/* ─── Stat Card ───────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  href,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ scale: 1.02 }}
        className={`flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md ${
          accent ? "border-accent/40 bg-accent/5" : ""
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            accent ? "bg-accent/15 text-accent" : "bg-secondary text-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-semibold leading-tight ${accent ? "text-accent" : ""}`}>
            {value}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
      </motion.div>
    </Link>
  );
}

/* ─── Section header ──────────────────────────────────────────── */

function SectionHeader({ title, href, linkLabel = "See all" }: { title: string; href: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Link href={href} className="text-xs text-accent hover:underline">
        {linkLabel}
      </Link>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────── */

export default function CrmOverviewPage() {
  const { data: leadsData } = useSWR<LeadsResponse>(
    "/api/field/crm/leads?page_size=5",
    apiFetcher
  );
  const { data: followUpsData } = useSWR<FollowUpsResponse>(
    "/api/field/crm/follow-ups?status=pending",
    apiFetcher
  );
  const { data: tasksData } = useSWR<TasksResponse>(
    "/api/field/crm/tasks?status=pending",
    apiFetcher
  );
  const { data: meetingsData } = useSWR<MeetingsResponse>(
    "/api/field/crm/meetings?upcoming=1",
    apiFetcher
  );

  const overdueFu = followUpsData?.follow_ups.filter(
    (fu) => fu.status === "pending" && isPast(fu.scheduled_at)
  ) ?? [];

  return (
    <div className="flex flex-col gap-6 p-5 md:p-8">

      {/* ── Stats grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Leads"
          value={leadsData?.total ?? "—"}
          href="/field/leads"
          icon={MapPin}
        />
        <StatCard
          label="Pending Follow-ups"
          value={followUpsData?.total ?? "—"}
          href="/field/crm/follow-ups"
          icon={Bell}
          accent={(followUpsData?.total ?? 0) > 0}
        />
        <StatCard
          label="Open Tasks"
          value={tasksData?.total ?? "—"}
          href="/field/crm/tasks"
          icon={ClipboardList}
        />
        <StatCard
          label="Upcoming Meetings"
          value={meetingsData?.total ?? "—"}
          href="/field/crm/meetings"
          icon={Calendar}
        />
      </div>

      {/* ── Overdue follow-ups alert ───────────────────────────── */}
      {overdueFu.length > 0 && (
        <Link href="/field/crm/follow-ups">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">
                {overdueFu.length} overdue follow-up{overdueFu.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {overdueFu
                  .slice(0, 2)
                  .map((fu) => fu.leads?.shop_name ?? FOLLOWUP_TYPE_LABELS[fu.type])
                  .join(", ")}
                {overdueFu.length > 2 ? ` + ${overdueFu.length - 2} more` : ""}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
          </div>
        </Link>
      )}

      {/* ── Upcoming meetings ──────────────────────────────────── */}
      {meetingsData && meetingsData.meetings.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Upcoming Meetings" href="/field/crm/meetings" />
          <div className="flex flex-col gap-2">
            {meetingsData.meetings.slice(0, 3).map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Calendar className="h-4 w-4 text-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(m.scheduled_at)}
                    {m.location ? ` · ${m.location}` : ""}
                  </p>
                </div>
                {m.leads && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {m.leads.shop_name}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending follow-ups ─────────────────────────────────── */}
      {followUpsData && followUpsData.follow_ups.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Pending Follow-ups" href="/field/crm/follow-ups" />
          <div className="flex flex-col gap-2">
            {followUpsData.follow_ups.slice(0, 4).map((fu) => {
              const overdue = isPast(fu.scheduled_at);
              return (
                <div
                  key={fu.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                    {TYPE_ICON[fu.type] ?? <Bell className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {FOLLOWUP_TYPE_LABELS[fu.type]}
                      </p>
                      {fu.leads && (
                        <span className="truncate text-xs text-muted-foreground">
                          · {fu.leads.shop_name}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs ${
                        overdue ? "text-destructive font-medium" : "text-muted-foreground"
                      }`}
                    >
                      <CalendarClock className="mr-1 inline h-3 w-3" />
                      {formatDateTime(fu.scheduled_at)}
                      {overdue ? " — Overdue" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Open tasks ─────────────────────────────────────────── */}
      {tasksData && tasksData.tasks.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Open Tasks" href="/field/crm/tasks" />
          <div className="flex flex-col gap-2">
            {tasksData.tasks.slice(0, 4).map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority] ?? "bg-muted"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {TASK_PRIORITY_LABELS[t.priority]}
                    {t.due_date ? ` · due ${formatDate(t.due_date)}` : ""}
                    {t.leads ? ` · ${t.leads.shop_name}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {TASK_STATUS_LABELS[t.status]}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent leads ───────────────────────────────────────── */}
      {leadsData && leadsData.leads.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Recent Leads" href="/field/leads" linkLabel="Manage leads" />
          <div className="flex flex-col gap-2">
            {leadsData.leads.slice(0, 4).map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <MapPin className="h-4 w-4 text-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.shop_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.owner_name}
                    {l.city ? ` · ${l.city}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-medium capitalize ${POTENTIAL_COLOR[l.potential] ?? ""}`}>
                  {l.potential}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All-clear state ───────────────────────────────────── */}
      {followUpsData?.total === 0 &&
        tasksData?.total === 0 &&
        meetingsData?.total === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
            <CheckSquare className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs text-muted-foreground">
              No pending follow-ups, tasks, or upcoming meetings.
            </p>
          </div>
        )}
    </div>
  );
}
