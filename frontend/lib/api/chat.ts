/**
 * CHAT API — typed wrappers around the Recruweb backend chat endpoints.
 * All requests are authenticated via lib/api/client (Supabase JWT).
 */
import { api } from "@/lib/api/client";

export type ChatSenderRole = "participant" | "admin";
export type ChatDeliveryStatus = "sent" | "delivered" | "read";

export interface ApiChatMessage {
  id: string;
  sender_role: ChatSenderRole;
  body: string;
  status: ChatDeliveryStatus;
  created_at: string;
}

export interface ApiChatThread {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_role: "client" | "field";
  last_message: string | null;
  last_message_at: string | null;
  unread_for_admin: number;
  unread_for_participant?: number;
  created_at: string;
}

export interface MyThreadResponse {
  thread: ApiChatThread;
  messages: ApiChatMessage[];
}

export interface ThreadSummaryResponse {
  unread: number;
  last_message: string | null;
  last_message_at: string | null;
}

export interface AdminThreadsResponse {
  threads: ApiChatThread[];
}

export interface AdminThreadResponse {
  thread: ApiChatThread;
  messages: ApiChatMessage[];
}

/* --------------------------- participant calls --------------------------- */

export const MY_THREAD_KEY = "/api/chat/thread";
export const MY_THREAD_SUMMARY_KEY = "/api/chat/thread/summary";

export function sendMyMessage(text: string) {
  return api<ApiChatMessage>("/api/chat/messages", {
    method: "POST",
    body: { text },
  });
}

/* ------------------------------ admin calls ------------------------------ */

export const ADMIN_THREADS_KEY = "/api/chat/threads";

export function adminThreadKey(id: string) {
  return `/api/chat/threads/${id}`;
}

export function sendAdminReply(threadId: string, text: string) {
  return api<ApiChatMessage>(`/api/chat/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    body: { text },
  });
}

/* ------------------------------- formatting ------------------------------ */

const TIME_FMT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

/** "10:42 AM" for today, "Yesterday", or "12 Jul" for older messages. */
export function formatChatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (dayDiff <= 0) return date.toLocaleTimeString("en-IN", TIME_FMT);
  if (dayDiff === 1) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Treat a thread as "online" if it had activity in the last 5 minutes. */
export function isRecentlyActive(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t < 5 * 60 * 1000;
}
