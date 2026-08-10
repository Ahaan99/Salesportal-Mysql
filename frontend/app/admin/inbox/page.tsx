"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowLeft, CheckCheck, Loader2, RotateCw, Search, Send } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  ADMIN_THREADS_KEY,
  adminThreadKey,
  formatChatTime,
  isRecentlyActive,
  sendAdminReply,
  type AdminThreadResponse,
  type AdminThreadsResponse,
} from "@/lib/api/chat";
import { cn } from "@/lib/utils";

type Filter = "all" | "client" | "field";

interface PendingReply {
  localId: string;
  text: string;
  failed: boolean;
}

/** crypto.randomUUID is unavailable in insecure contexts (plain-HTTP LAN
 *  testing) and older browsers — fall back to a collision-safe local id. */
function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function AdminInboxPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingReply[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    data: threadsData,
    error: threadsError,
    isLoading: threadsLoading,
    mutate: mutateThreads,
  } = useSWR<AdminThreadsResponse>(ADMIN_THREADS_KEY, apiFetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const threads = threadsData?.threads ?? [];

  // Auto-select the most recent thread on first load (desktop only UX nicety).
  useEffect(() => {
    if (!activeId && threads.length > 0) setActiveId(threads[0].id);
  }, [activeId, threads]);

  const {
    data: activeData,
    error: activeError,
    isLoading: activeLoading,
    mutate: mutateActive,
  } = useSWR<AdminThreadResponse>(activeId ? adminThreadKey(activeId) : null, apiFetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const active = activeData?.thread ?? threads.find((t) => t.id === activeId) ?? null;
  const messages = activeData?.messages ?? [];

  const visible = threads.filter((t) => {
    if (filter !== "all" && t.participant_role !== filter) return false;
    if (query && !t.participant_name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeId, messages.length, pending.length]);

  // Switching threads clears any thread-scoped transient state.
  function openThread(id: string) {
    setActiveId(id);
    setMobileOpen(true);
    setPending([]);
    setSendError(null);
    // Optimistically zero the unread badge; the server does it on GET.
    void mutateThreads(
      (prev) =>
        prev
          ? { threads: prev.threads.map((t) => (t.id === id ? { ...t, unread_for_admin: 0 } : t)) }
          : prev,
      { revalidate: false }
    );
  }

  const reply = useCallback(
    async (text: string, retryLocalId?: string) => {
      const clean = text.trim();
      if (!clean || clean.length > 2000 || !activeId) return;
      setSendError(null);

      const threadId = activeId;
      const localId = retryLocalId ?? newLocalId();
      setPending((p) =>
        retryLocalId
          ? p.map((m) => (m.localId === retryLocalId ? { ...m, failed: false } : m))
          : [...p, { localId, text: clean, failed: false }]
      );
      if (!retryLocalId) setDraft("");

      try {
        await sendAdminReply(threadId, clean);
        if (!mountedRef.current) return;
        await Promise.all([mutateActive(), mutateThreads()]);
        if (!mountedRef.current) return;
        setPending((p) => p.filter((m) => m.localId !== localId));
      } catch (err) {
        if (!mountedRef.current) return;
        // openThread() clears pending on switch — only surface the failure
        // if the admin is still looking at the thread the send targeted.
        if (activeIdRef.current !== threadId) return;
        setPending((p) => p.map((m) => (m.localId === localId ? { ...m, failed: true } : m)));
        setSendError(err instanceof ApiError ? err.message : "Could not send your reply.");
      }
    },
    [activeId, mutateActive, mutateThreads]
  );

  return (
    <div className="flex h-[calc(100vh-9.5rem)] overflow-hidden rounded-xl border border-border bg-card">
      {/* Thread list */}
      <div
        className={cn(
          "flex w-full flex-col border-r border-border md:w-80 lg:w-96",
          mobileOpen ? "hidden md:flex" : "flex"
        )}
      >
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="h-10 w-full rounded-full border border-input bg-secondary/50 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
          <div className="flex gap-2" role="tablist" aria-label="Filter conversations">
            {(
              [
                { value: "all", label: "All" },
                { value: "client", label: "Clients" },
                { value: "field", label: "Officers" },
              ] as const
            ).map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="scrollbar-slim flex-1 overflow-y-auto">
          {threadsLoading && !threadsData && (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading conversations…
            </div>
          )}

          {threadsError && !threadsData && (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {threadsError instanceof ApiError
                  ? threadsError.message
                  : "Could not load conversations."}
              </p>
              <button
                onClick={() => mutateThreads()}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                Try again
              </button>
            </div>
          )}

          {threadsData && visible.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No conversations found.
            </p>
          )}

          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => openThread(t.id)}
              aria-current={t.id === activeId ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-left transition-colors last:border-0",
                t.id === activeId ? "bg-primary/5" : "hover:bg-secondary/60"
              )}
            >
              <Avatar seed={t.participant_name} online={isRecentlyActive(t.last_message_at)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{t.participant_name}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatChatTime(t.last_message_at)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">
                    {t.last_message ?? "No messages yet"}
                  </p>
                  {t.unread_for_admin > 0 && (
                    <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                      {t.unread_for_admin > 9 ? "9+" : t.unread_for_admin}
                    </span>
                  )}
                </div>
                <Badge
                  variant={t.participant_role === "client" ? "accent" : "success"}
                  className="mt-1.5"
                >
                  {t.participant_role === "client" ? "Client" : "Field officer"}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation pane */}
      <div className={cn("flex min-w-0 flex-1 flex-col", mobileOpen ? "flex" : "hidden md:flex")}>
        {active ? (
          <>
            <div className="flex items-center gap-3 border-b border-border bg-ink px-4 py-3 text-ink-foreground">
              <button
                className="rounded-lg p-1.5 hover:bg-ink-soft md:hidden"
                onClick={() => setMobileOpen(false)}
                aria-label="Back to conversation list"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </button>
              <Avatar
                seed={active.participant_name}
                online={isRecentlyActive(active.last_message_at)}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{active.participant_name}</p>
                <p className="text-xs text-ink-muted">
                  {active.participant_role === "client" ? "Vendor client" : "Field sales officer"}
                  {isRecentlyActive(active.last_message_at)
                    ? " · active now"
                    : " · last seen recently"}
                </p>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="scrollbar-slim flex-1 overflow-y-auto bg-secondary/60 p-4 md:p-6"
              aria-live="polite"
            >
              <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
                {activeLoading && !activeData && (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading messages…
                  </div>
                )}

                {activeError && !activeData && (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      {activeError instanceof ApiError
                        ? activeError.message
                        : "Could not load this conversation."}
                    </p>
                    <button
                      onClick={() => mutateActive()}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {activeData && messages.length === 0 && pending.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No messages in this conversation yet.
                  </p>
                )}

                <AnimatePresence initial={false}>
                  {messages.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                        m.sender_role === "admin"
                          ? "self-end rounded-br-sm bg-primary text-primary-foreground"
                          : "self-start rounded-bl-sm bg-card text-card-foreground shadow-sm"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p
                        className={cn(
                          "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                          m.sender_role === "admin"
                            ? "text-primary-foreground/60"
                            : "text-muted-foreground"
                        )}
                      >
                        {formatChatTime(m.created_at)}
                        {m.sender_role === "admin" && (
                          <CheckCheck
                            className={cn(
                              "h-3 w-3",
                              m.status === "read" ? "text-accent" : "opacity-60"
                            )}
                            aria-hidden
                          />
                        )}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {pending.map((m) => (
                  <div
                    key={m.localId}
                    className={cn(
                      "max-w-[78%] self-end rounded-2xl rounded-br-sm px-3.5 py-2 text-sm leading-relaxed",
                      m.failed
                        ? "bg-destructive/15 text-destructive"
                        : "bg-primary/80 text-primary-foreground"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-80">
                      {m.failed ? (
                        <button
                          onClick={() => reply(m.text, m.localId)}
                          className="flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                        >
                          <RotateCw className="h-3 w-3" aria-hidden />
                          Failed — tap to retry
                        </button>
                      ) : (
                        <>
                          sending
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        </>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {sendError && (
              <p
                role="alert"
                className="border-t border-border bg-destructive/10 px-4 py-2 text-xs text-destructive"
              >
                {sendError}
              </p>
            )}

            <form
              className="flex items-center gap-2 border-t border-border bg-card p-3"
              onSubmit={(e) => {
                e.preventDefault();
                reply(draft);
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    e.preventDefault();
                    reply(draft);
                  }
                }}
                maxLength={2000}
                placeholder={`Reply to ${active.participant_name.split(" ")[0]}…`}
                aria-label="Type a reply"
                className="h-10 flex-1 rounded-full border border-input bg-secondary/50 px-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <button
                type="submit"
                aria-label="Send reply"
                disabled={!draft.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {threadsLoading && !threadsData
              ? "Loading…"
              : "Select a conversation to start replying."}
          </div>
        )}
      </div>
    </div>
  );
}
