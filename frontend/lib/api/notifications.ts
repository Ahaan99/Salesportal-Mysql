import { api, apiFetcher } from "@/lib/api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NotificationSettings {
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  push_enabled: boolean;
}

export interface NotificationConfig {
  email:     { configured: boolean; host: string | null; from: string | null };
  sms:       { configured: boolean; fromNumber: string | null };
  whatsapp:  { configured: boolean; fromNumber: string | null };
  push:      { configured: boolean; publicKey: string | null };
}

// ─── SWR keys ─────────────────────────────────────────────────────────────────

export const NOTIFICATIONS_KEY         = "/api/notifications";
export const NOTIFICATIONS_COUNT_KEY   = "/api/notifications/unread-count";
export const NOTIFICATION_SETTINGS_KEY = "/api/notifications/settings";

export function notificationsPageKey(page: number, unreadOnly = false) {
  const p = new URLSearchParams({ page: String(page) });
  if (unreadOnly) p.set("unread_only", "true");
  return `/api/notifications?${p.toString()}`;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export const fetchNotifications = (url: string): Promise<NotificationListResponse> =>
  apiFetcher<NotificationListResponse>(url);

export const fetchNotificationSettings = (url: string): Promise<NotificationSettings> =>
  apiFetcher<NotificationSettings>(url);

export const fetchUnreadCount = (url: string): Promise<{ count: number }> =>
  apiFetcher<{ count: number }>(url);

// ─── Actions ─────────────────────────────────────────────────────────────────

export const markNotificationRead = (id: string) =>
  api<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "PATCH" });

export const markAllRead = () =>
  api<{ ok: boolean }>("/api/notifications/read-all", { method: "PATCH" });

export const deleteNotification = (id: string) =>
  api<{ ok: boolean }>(`/api/notifications/${id}`, { method: "DELETE" });

export const clearAllNotifications = () =>
  api<{ ok: boolean }>("/api/notifications", { method: "DELETE" });

export const updateNotificationSettings = (settings: Partial<NotificationSettings>) =>
  api<NotificationSettings>("/api/notifications/settings", { method: "PUT", body: settings });

export const registerPushSubscription = (subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) =>
  api<{ ok: boolean }>("/api/notifications/push-subscription", {
    method: "POST",
    body: subscription,
  });

// ─── Admin Actions ────────────────────────────────────────────────────────────

export const fetchAdminNotifications = (url: string): Promise<NotificationListResponse> =>
  apiFetcher<NotificationListResponse>(url);

export const fetchNotificationConfig = (url: string): Promise<NotificationConfig> =>
  apiFetcher<NotificationConfig>(url);

export const ADMIN_NOTIFICATIONS_KEY     = "/api/admin/notifications";
export const ADMIN_NOTIFICATIONS_CONFIG  = "/api/admin/notifications/config";

export const adminSendNotification = (payload: {
  recipientUserId?: string;
  recipientRole?: string;
  title: string;
  message: string;
  type?: string;
  channels?: string[];
}) =>
  api<{ ok: boolean; results: unknown[] }>("/api/admin/notifications/send", {
    method: "POST",
    body: payload,
  });

export const adminBroadcast = (payload: {
  title: string;
  message: string;
  type?: string;
  channels?: string[];
}) =>
  api<{ ok: boolean; sent: number }>("/api/admin/notifications/broadcast", {
    method: "POST",
    body: payload,
  });

export const adminTestChannel = (payload: {
  channel: string;
  recipientEmail?: string;
  recipientPhone?: string;
}) =>
  api<{ channel: string; status: string; error?: string }>(
    "/api/admin/notifications/test",
    { method: "POST", body: payload }
  );
