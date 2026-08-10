"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCheck, Loader2, MessageCircle, RotateCw, Send, X } from "lucide-react";
import { apiFetcher, ApiError } from "@/lib/api/client";
import {
  MY_THREAD_KEY,
  MY_THREAD_SUMMARY_KEY,
  formatChatTime,
  sendMyMessage,
  type ApiChatMessage,
  type MyThreadResponse,
  type ThreadSummaryResponse,
} from "@/lib/api/chat";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

const quickChips = ["Order status", "Listing review", "Credit terms", "Talk to a human"];

/** crypto.randomUUID is unavailable in insecure contexts (plain-HTTP LAN
 *  testing) and older browsers — fall back to a collision-safe local id. */
function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface PendingMessage {
  localId: string;
  text: string;
  failed: boolean;
}

export function ChatWidget({ userName }: { userName: string }) {
  const { user, loading: userLoading } = useUser();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const pendingRef = useRef<PendingMessage[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks in-flight sends so unmount doesn't try to update state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR<MyThreadResponse>(open && user ? MY_THREAD_KEY : null, apiFetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  // Lightweight unread poll while the panel is closed.
  const { data: summary } = useSWR<ThreadSummaryResponse>(
    !open && user ? MY_THREAD_SUMMARY_KEY : null,
    apiFetcher,
    { refreshInterval: 15000, revalidateOnFocus: true }
  );

  const messages: ApiChatMessage[] = data?.messages ?? [];
  const unread = open ? 0 : (summary?.unread ?? 0);

  // Dialog a11y: focus the composer when the panel opens, close on Escape.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending.length, open]);

  const send = useCallback(
    async (text: string, retryLocalId?: string) => {
      const clean = text.trim();
      if (!clean || clean.length > 2000) return;
      // Quick chips can be double-clicked — skip if that exact text is
      // already in flight (retries pass retryLocalId and bypass this).
      if (!retryLocalId && pendingRef.current.some((m) => !m.failed && m.text === clean)) return;
      setSendError(null);

      const localId = retryLocalId ?? newLocalId();
      setPending((p) =>
        retryLocalId
          ? p.map((m) => (m.localId === retryLocalId ? { ...m, failed: false } : m))
          : [...p, { localId, text: clean, failed: false }]
      );
      if (!retryLocalId) setDraft("");

      try {
        await sendMyMessage(clean);
        if (!mountedRef.current) return;
        // Server accepted it — refresh the thread, then drop the local copy.
        await mutate();
        if (!mountedRef.current) return;
        setPending((p) => p.filter((m) => m.localId !== localId));
      } catch (err) {
        if (!mountedRef.current) return;
        setPending((p) => p.map((m) => (m.localId === localId ? { ...m, failed: true } : m)));
        setSendError(err instanceof ApiError ? err.message : "Could not send your message.");
      }
    },
    [mutate]
  );

  // Never render for signed-out visitors — chat requires a session.
  if (userLoading || !user) return null;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-24 right-6 z-50 flex h-[520px] w-[min(380px,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            role="dialog"
            aria-label="Support chat"
          >
            {/* Header */}
            <div className="flex items-center gap-3 bg-ink px-4 py-3.5 text-ink-foreground">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                M
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Recruweb Support</p>
                <p className="flex items-center gap-1.5 text-xs text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                  online — replies in minutes
                </p>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="scrollbar-slim flex-1 overflow-y-auto bg-secondary/60 p-4"
              aria-live="polite"
            >
              <p className="mx-auto mb-4 w-fit rounded-full bg-card px-3 py-1 text-[11px] text-muted-foreground">
                Chatting as {userName}
              </p>

              {isLoading && !data && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading conversation…
                </div>
              )}

              {loadError && !data && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    {loadError instanceof ApiError
                      ? loadError.message
                      : "Could not load your conversation."}
                  </p>
                  <button
                    onClick={() => mutate()}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    Try again
                  </button>
                </div>
              )}

              {data && messages.length === 0 && pending.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Start the conversation — our team replies within minutes.
                </p>
              )}

              <div className="flex flex-col gap-2.5">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                      m.sender_role === "participant"
                        ? "self-end rounded-br-sm bg-primary text-primary-foreground"
                        : "self-start rounded-bl-sm bg-card text-card-foreground shadow-sm"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p
                      className={cn(
                        "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                        m.sender_role === "participant"
                          ? "text-primary-foreground/60"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatChatTime(m.created_at)}
                      {m.sender_role === "participant" && (
                        <CheckCheck
                          className={cn("h-3 w-3", m.status === "read" ? "text-accent" : "opacity-60")}
                          aria-hidden
                        />
                      )}
                    </p>
                  </div>
                ))}

                {pending.map((m) => (
                  <div
                    key={m.localId}
                    className={cn(
                      "max-w-[82%] self-end rounded-2xl rounded-br-sm px-3.5 py-2 text-sm leading-relaxed",
                      m.failed ? "bg-destructive/15 text-destructive" : "bg-primary/80 text-primary-foreground"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-80">
                      {m.failed ? (
                        <button
                          onClick={() => send(m.text, m.localId)}
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

            {/* Quick chips */}
            <div className="flex gap-2 overflow-x-auto border-t border-border bg-card px-3 py-2.5">
              {quickChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => send(chip)}
                  className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Composer */}
            <form
              className="flex items-center gap-2 border-t border-border bg-card p-3"
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
            >
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    e.preventDefault();
                    send(draft);
                  }
                }}
                maxLength={2000}
                placeholder="Type a message"
                aria-label="Type a message"
                className="h-10 flex-1 rounded-full border border-input bg-secondary/50 px-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <button
                type="submit"
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                disabled={!draft.trim()}
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
