"use client";

    import { useState, useCallback } from "react";
    import useSWR from "swr";
    import {
    Bell, BellOff, CheckCircle2, Loader2,
    Mail, MessageCircle, Phone, Save, Smartphone, XCircle,
    } from "lucide-react";
    import { Badge } from "@/components/ui/badge";
    import { Button } from "@/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
    import {
    fetchNotificationSettings,
    updateNotificationSettings,
    registerPushSubscription,
    NOTIFICATION_SETTINGS_KEY,
    type NotificationSettings,
    } from "@/lib/api/notifications";

    function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
    }

    interface ChannelRowProps {
    icon: React.ElementType;
    label: string;
    description: string;
    enabled: boolean;
    onChange: (v: boolean) => void;
    badge?: string;
    }

    function ChannelRow({ icon: Icon, label, description, enabled, onChange, badge }: ChannelRowProps) {
    return (
      <div className="flex items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{label}</p>
              {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => onChange(!enabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${enabled ? "bg-primary" : "bg-input"}`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`}
          />
        </button>
      </div>
    );
    }

    type PushState = "idle" | "requesting" | "subscribed" | "denied" | "error" | "unsupported";

    export default function NotificationSettingsPage() {
    const { data: settings, mutate } = useSWR(NOTIFICATION_SETTINGS_KEY, fetchNotificationSettings);
    const [local, setLocal] = useState<Partial<NotificationSettings>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [pushState, setPushState] = useState<PushState>("idle");
    const [pushError, setPushError] = useState<string | null>(null);

    const merged = { ...settings, ...local } as NotificationSettings;

    function toggle(key: keyof NotificationSettings) {
      setLocal(prev => ({ ...prev, [key]: !merged[key] }));
      setSaved(false);
    }

    const handleSubscribePush = useCallback(async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushState("unsupported");
        return;
      }

      setPushState("requesting");
      setPushError(null);

      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setPushState("denied");
          return;
        }

        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) throw new Error("VAPID public key not configured");

        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });

        const subJson = subscription.toJSON();
        await registerPushSubscription({
          endpoint: subJson.endpoint!,
          p256dh:   subJson.keys!.p256dh,
          auth:     subJson.keys!.auth,
        });

        setLocal(prev => ({ ...prev, push_enabled: true }));
        setPushState("subscribed");
        mutate();
      } catch (err: unknown) {
        setPushState("error");
        setPushError(err instanceof Error ? err.message : "Push subscription failed");
      }
    }, [mutate]);

    async function handleSave() {
      setSaving(true);
      try {
        await updateNotificationSettings({
          email_enabled:    merged.email_enabled    ?? true,
          sms_enabled:      merged.sms_enabled      ?? false,
          whatsapp_enabled: merged.whatsapp_enabled ?? false,
          push_enabled:     merged.push_enabled     ?? false,
        });
        mutate();
        setLocal({});
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch {
        // next save will retry
      } finally {
        setSaving(false);
      }
    }

    const hasChanges = Object.keys(local).length > 0;

    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Notification Channels</CardTitle>
            </div>
            <CardDescription>
              Choose how you want to receive notifications from Recruweb.
              In-app notifications are always on.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {/* In-app — always on */}
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">In-app</p>
                    <Badge variant="secondary" className="text-[10px]">Always on</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Notifications inside the portal</p>
                </div>
              </div>
              <div className="rounded-full bg-primary/10 p-1">
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
            </div>

            <ChannelRow
              icon={Mail}
              label="Email"
              description="Receive updates via email"
              enabled={merged.email_enabled ?? true}
              onChange={() => toggle("email_enabled")}
            />
            <ChannelRow
              icon={Phone}
              label="SMS"
              description="Text message alerts for critical events"
              enabled={merged.sms_enabled ?? false}
              onChange={() => toggle("sms_enabled")}
              badge="Requires phone"
            />
            <ChannelRow
              icon={MessageCircle}
              label="WhatsApp"
              description="Updates via WhatsApp message"
              enabled={merged.whatsapp_enabled ?? false}
              onChange={() => toggle("whatsapp_enabled")}
              badge="Requires phone"
            />

            {/* Push — special handling */}
            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${(merged.push_enabled || pushState === "subscribed") ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Browser Push</p>
                      {pushState === "subscribed" && <Badge variant="success" className="text-[10px]">Subscribed</Badge>}
                      {merged.push_enabled && pushState === "idle" && <Badge variant="secondary" className="text-[10px]">Enabled in settings</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">Desktop &amp; mobile push notifications</p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={merged.push_enabled ?? false}
                  onClick={() => toggle("push_enabled")}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${(merged.push_enabled) ? "bg-primary" : "bg-input"}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${(merged.push_enabled) ? "translate-x-4" : "translate-x-0"}`}
                  />
                </button>
              </div>

              {/* Push subscription button */}
              {merged.push_enabled && pushState !== "subscribed" && (
                <div className="ml-11 space-y-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSubscribePush}
                    disabled={pushState === "requesting"}
                    className="gap-2 text-xs"
                  >
                    {pushState === "requesting" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {pushState === "requesting" ? "Requesting permission…" : "Subscribe this browser"}
                  </Button>
                  {pushState === "denied" && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <XCircle className="h-3.5 w-3.5" />
                      Permission denied. Allow notifications in browser settings.
                    </p>
                  )}
                  {pushState === "error" && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <XCircle className="h-3.5 w-3.5" />
                      {pushError ?? "Push setup failed. Try again."}
                    </p>
                  )}
                  {pushState === "unsupported" && (
                    <p className="text-xs text-muted-foreground">
                      Push notifications are not supported in this browser.
                    </p>
                  )}
                </div>
              )}

              {pushState === "subscribed" && (
                <div className="ml-11">
                  <p className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    This browser is subscribed to push notifications.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* What you'll receive */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BellOff className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">What you'll receive</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                "KYC status updates (approved / rejected)",
                "Sale verification results",
                "Commission released & payout processed",
                "Messages from the Recruweb admin team",
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          {saved && (
            <p className="text-xs text-green-600 dark:text-green-400">Settings saved successfully.</p>
          )}
          <div className="ml-auto">
            <Button onClick={handleSave} disabled={!hasChanges || saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save preferences"}
            </Button>
          </div>
        </div>
      </div>
    );
    }
    