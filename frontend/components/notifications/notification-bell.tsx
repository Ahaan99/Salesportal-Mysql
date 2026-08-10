"use client";

    import { useState, useRef, useEffect } from "react";
    import useSWR, { useSWRConfig } from "swr";
    import { AnimatePresence, motion } from "framer-motion";
    import { Bell, Check, CheckCheck, Loader2, Trash2, X } from "lucide-react";
    import {
    NOTIFICATIONS_KEY,
    NOTIFICATIONS_COUNT_KEY,
    fetchNotifications,
    fetchUnreadCount,
    markNotificationRead,
    markAllRead,
    deleteNotification,
    } from "@/lib/api/notifications";

    function timeAgo(dateStr: string) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
    }

    export function NotificationBell() {
    const [open, setOpen] = useState(false);
    const [marking, setMarking] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const { mutate } = useSWRConfig();

    const { data: countData } = useSWR(
      NOTIFICATIONS_COUNT_KEY,
      fetchUnreadCount,
      { refreshInterval: 30_000, revalidateOnFocus: true }
    );

    const { data: notifData, isLoading } = useSWR(
      open ? NOTIFICATIONS_KEY : null,
      fetchNotifications
    );

    const unread = countData?.count ?? 0;
    const notifications = notifData?.notifications ?? [];

    useEffect(() => {
      function onMouseDown(e: MouseEvent) {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      if (open) document.addEventListener("mousedown", onMouseDown);
      return () => document.removeEventListener("mousedown", onMouseDown);
    }, [open]);

    useEffect(() => {
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
      }
      if (open) document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    async function handleMarkRead(id: string) {
      setMarking(id);
      try {
        await markNotificationRead(id);
        mutate(NOTIFICATIONS_KEY);
        mutate(NOTIFICATIONS_COUNT_KEY);
      } finally { setMarking(null); }
    }

    async function handleMarkAllRead() {
      await markAllRead();
      mutate(NOTIFICATIONS_KEY);
      mutate(NOTIFICATIONS_COUNT_KEY);
    }

    async function handleDelete(id: string) {
      setDeleting(id);
      try {
        await deleteNotification(id);
        mutate(NOTIFICATIONS_KEY);
        mutate(NOTIFICATIONS_COUNT_KEY);
      } finally { setDeleting(null); }
    }

    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
          aria-expanded={open}
          className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -6 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-[360px] overflow-hidden rounded-xl border border-border bg-background shadow-xl shadow-black/10 ring-1 ring-black/5"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-semibold">Notifications</span>
                  {unread > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {unread} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  {unread > 0 && (
                    <button onClick={handleMarkAllRead} title="Mark all as read"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground">
                      <CheckCheck className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  <button onClick={() => setOpen(false)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto overscroll-contain">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="rounded-full bg-muted p-3">
                      <Bell className="h-5 w-5 text-muted-foreground/40" aria-hidden />
                    </div>
                    <div>
                      <p className="text-sm font-medium">All caught up</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">No notifications yet</p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map(n => (
                      <motion.div key={n.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className={`group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-accent/5 ${!n.read ? "bg-primary/[0.025]" : ""}`}
                      >
                        <div aria-hidden
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${n.read ? "bg-transparent" : "bg-primary"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm leading-snug ${n.read ? "text-foreground/75" : "font-medium text-foreground"}`}>
                            {n.title}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                            {n.message}
                          </p>
                          <p className="mt-1.5 text-[10px] text-muted-foreground/55">{timeAgo(n.created_at)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {!n.read && (
                            <button onClick={() => handleMarkRead(n.id)} disabled={marking === n.id}
                              title="Mark as read"
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground disabled:opacity-40">
                              {marking === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          <button onClick={() => handleDelete(n.id)} disabled={deleting === n.id}
                            title="Delete"
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">
                            {deleting === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {notifications.length > 0 && (
                <div className="border-t border-border bg-muted/30 px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
                    {unread > 0 && ` · ${unread} unread`}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
    }
    