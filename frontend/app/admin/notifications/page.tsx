"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Mail,
  MessageCircle,
  Phone,
  Radio,
  Send,
  Settings,
  Smartphone,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ADMIN_NOTIFICATIONS_KEY,
  ADMIN_NOTIFICATIONS_CONFIG,
  fetchAdminNotifications,
  fetchNotificationConfig,
  adminSendNotification,
  adminBroadcast,
  adminTestChannel,
  type NotificationConfig,
} from "@/lib/api/notifications";

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CHANNEL_ICONS = {
  email:    Mail,
  sms:      Phone,
  whatsapp: MessageCircle,
  push:     Smartphone,
};

function ChannelCard({
  channel,
  label,
  description,
  config,
  onTest,
  testing,
  testResult,
}: {
  channel: "email" | "sms" | "whatsapp" | "push";
  label: string;
  description: string;
  config: { configured: boolean; [k: string]: unknown };
  onTest: () => void;
  testing: boolean;
  testResult: { status: string; error?: string } | null;
}) {
  const Icon = CHANNEL_ICONS[channel];
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`rounded-lg p-2 ${config.configured ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{label}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
          <Badge variant={config.configured ? "success" : "secondary"}>
            {config.configured ? "Active" : "Not configured"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!config.configured && (
          <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            Add the required environment variables to <code className="font-mono">backend/.env</code> to enable this channel.
          </div>
        )}
        {config.configured && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {Object.entries(config).filter(([k]) => k !== "configured").map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="font-medium">{k}:</span>
                <span className="font-mono">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onTest}
          disabled={!config.configured || testing}
          className="w-full"
        >
          {testing ? "Sending test…" : "Send test notification"}
        </Button>
        {testResult && (
          <div className={`flex items-center gap-1.5 text-xs ${testResult.status === "sent" ? "text-green-600" : "text-red-500"}`}>
            {testResult.status === "sent"
              ? <CheckCircle2 className="h-3.5 w-3.5" />
              : <XCircle className="h-3.5 w-3.5" />}
            {testResult.status === "sent" ? "Test sent successfully" : testResult.error ?? "Test failed"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminNotificationsPage() {
  const { data: configData } = useSWR(ADMIN_NOTIFICATIONS_CONFIG, fetchNotificationConfig);
  const { data: listData, mutate: mutateList } = useSWR(
    ADMIN_NOTIFICATIONS_KEY,
    fetchAdminNotifications,
    { refreshInterval: 15_000 }
  );

  // Compose form
  const [composeTarget, setComposeTarget] = useState<"user" | "role" | "broadcast">("broadcast");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [recipientRole, setRecipientRole] = useState<"field" | "client" | "admin">("field");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState<string[]>(["inapp", "email"]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  // Test channel state
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { status: string; error?: string }>>({});

  function toggleChannel(ch: string) {
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  }

  async function handleSend() {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      if (composeTarget === "broadcast") {
        const r = await adminBroadcast({ title, message, channels });
        setSendResult(`Broadcast sent to ${r.sent} users.`);
      } else if (composeTarget === "role") {
        await adminSendNotification({ recipientRole, title, message, channels });
        setSendResult(`Notification sent to all ${recipientRole} users.`);
      } else {
        if (!recipientUserId.trim()) { setSendResult("Please enter a user ID."); return; }
        await adminSendNotification({ recipientUserId, title, message, channels });
        setSendResult("Notification sent to user.");
      }
      setTitle(""); setMessage("");
      mutateList();
    } catch {
      setSendResult("Failed to send. Check the console for details.");
    } finally {
      setSending(false);
    }
  }

  async function handleTest(channel: "email" | "sms" | "whatsapp" | "push") {
    setTesting(p => ({ ...p, [channel]: true }));
    setTestResults(p => ({ ...p, [channel]: undefined as never }));
    try {
      const r = await adminTestChannel({ channel });
      setTestResults(p => ({ ...p, [channel]: r }));
    } catch {
      setTestResults(p => ({ ...p, [channel]: { status: "error", error: "Request failed" } }));
    } finally {
      setTesting(p => ({ ...p, [channel]: false }));
    }
  }

  const notifications = listData?.notifications ?? [];
  const config = configData;

  const CHANNELS_LIST: Array<{ id: "email" | "sms" | "whatsapp" | "push"; label: string; desc: string }> = [
    { id: "email",    label: "Email",    desc: "SMTP_HOST / SMTP_USER / SMTP_PASS" },
    { id: "sms",      label: "SMS",      desc: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER" },
    { id: "whatsapp", label: "WhatsApp", desc: "TWILIO_ACCOUNT_SID / TWILIO_WHATSAPP_NUMBER" },
    { id: "push",     label: "Push",     desc: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY" },
  ];

  return (
    <div className="space-y-8">
      {/* Channel configuration */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Channel Configuration</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CHANNELS_LIST.map(({ id, label, desc }) => (
            <ChannelCard
              key={id}
              channel={id}
              label={label}
              description={desc}
              config={config?.[id] ?? { configured: false }}
              onTest={() => handleTest(id)}
              testing={testing[id] ?? false}
              testResult={testResults[id] ?? null}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Compose */}
        <section className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Send Notification</CardTitle>
              </div>
              <CardDescription>Compose and send a manual notification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Target */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">RECIPIENT</label>
                <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                  {(["broadcast", "role", "user"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setComposeTarget(t)}
                      className={`flex-1 px-3 py-2 capitalize transition-colors ${composeTarget === t ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {composeTarget === "role" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">ROLE</label>
                  <select
                    value={recipientRole}
                    onChange={e => setRecipientRole(e.target.value as never)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="field">Field Officers</option>
                    <option value="client">Clients / Vendors</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>
              )}

              {composeTarget === "user" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">USER ID</label>
                  <input
                    value={recipientUserId}
                    onChange={e => setRecipientUserId(e.target.value)}
                    placeholder="paste user UUID"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50"
                  />
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">TITLE</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Notification title"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">MESSAGE</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Notification body text…"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>

              {/* Channels */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">CHANNELS</label>
                <div className="flex flex-wrap gap-2">
                  {["inapp", "email", "sms", "whatsapp", "push"].map(ch => (
                    <button
                      key={ch}
                      onClick={() => toggleChannel(ch)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${channels.includes(ch) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleSend}
                disabled={sending || !title.trim() || !message.trim()}
                className="w-full gap-2"
              >
                {sending ? <Radio className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                {sending ? "Sending…" : composeTarget === "broadcast" ? "Broadcast to All" : "Send"}
              </Button>

              {sendResult && (
                <p className="text-center text-xs text-muted-foreground">{sendResult}</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Recent notifications */}
        <section className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Recent Notifications</CardTitle>
              </div>
              <CardDescription>All notifications sent across the platform</CardDescription>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <BellRing className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                <div className="space-y-0 divide-y divide-border">
                  {notifications.map(n => (
                    <div key={n.id} className="flex items-start gap-3 py-3.5">
                      <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-muted-foreground/30" : "bg-primary"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{n.title}</p>
                          <Badge variant="outline" className="shrink-0 text-[10px]">{n.type}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{n.message}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground/60">
                          {n.user_id ? `User: ${(n.user_id as string).slice(0, 8)}…` : "broadcast"} · {timeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
