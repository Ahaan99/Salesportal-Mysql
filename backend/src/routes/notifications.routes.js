"use strict";
const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { supabaseAdmin }            = require("../config/supabase");
const { sendNotification, testChannel } = require("../utils/notifications");

const router = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const clamp = (n, lo, hi, fb) => { const v = parseInt(n, 10); return isNaN(v) ? fb : Math.min(Math.max(v, lo), hi); };

// ─── user routes (any authenticated user) ───────────────────────────────────

/** GET /api/notifications?page=1&unread_only=true */
router.get("/", requireAuth, async (req, res) => {
  try {
    const page       = clamp(req.query.page, 1, 500, 1);
    const unreadOnly = req.query.unread_only === "true";
    const offset     = (page - 1) * PAGE_SIZE;

    let q = supabaseAdmin
      .from("notifications")
      .select("id, type, title, message, read, metadata, created_at", { count: "exact" })
      .eq("user_id", req.user.id);

    if (unreadOnly) q = q.eq("read", false);

    const { data, count, error } = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    return res.json({ notifications: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("[notifications:list]", err.message);
    return res.status(500).json({ error: "Could not load notifications." });
  }
});

/** GET /api/notifications/unread-count */
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    const { count, error } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.user.id)
      .eq("read", false);

    if (error) throw error;
    return res.json({ count: count ?? 0 });
  } catch (err) {
    return res.status(500).json({ error: "Could not count notifications." });
  }
});

/** PATCH /api/notifications/:id/read */
router.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Could not mark as read." });
  }
});

/** PATCH /api/notifications/read-all */
router.patch("/read-all", requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("user_id", req.user.id)
      .eq("read", false);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Could not mark all as read." });
  }
});

/** DELETE /api/notifications/:id */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Could not delete notification." });
  }
});

/** DELETE /api/notifications (clear all for user) */
router.delete("/", requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("user_id", req.user.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Could not clear notifications." });
  }
});

// ─── notification settings ───────────────────────────────────────────────────

/** GET /api/notifications/settings */
router.get("/settings", requireAuth, async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from("notification_settings")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();
    // Return defaults if not set yet
    return res.json(data ?? {
      user_id:          req.user.id,
      email_enabled:    true,
      sms_enabled:      false,
      whatsapp_enabled: false,
      push_enabled:     false,
    });
  } catch (err) {
    return res.status(500).json({ error: "Could not load settings." });
  }
});

/** PUT /api/notifications/settings */
router.put("/settings", requireAuth, async (req, res) => {
  try {
    const { email_enabled, sms_enabled, whatsapp_enabled, push_enabled } = req.body ?? {};
    const { data, error } = await supabaseAdmin
      .from("notification_settings")
      .upsert({
        user_id:          req.user.id,
        email_enabled:    Boolean(email_enabled ?? true),
        sms_enabled:      Boolean(sms_enabled ?? false),
        whatsapp_enabled: Boolean(whatsapp_enabled ?? false),
        push_enabled:     Boolean(push_enabled ?? false),
        updated_at:       new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select().single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: "Could not save settings." });
  }
});

/** POST /api/notifications/push-subscription — register web push subscription */
router.post("/push-subscription", requireAuth, async (req, res) => {
  try {
    const { endpoint, p256dh, auth: authKey } = req.body ?? {};
    if (!endpoint || !p256dh || !authKey) {
      return res.status(400).json({ error: "endpoint, p256dh, and auth are required." });
    }
    const { error } = await supabaseAdmin
      .from("notification_settings")
      .upsert({
        user_id:       req.user.id,
        push_enabled:  true,
        push_endpoint: endpoint,
        push_p256dh:   p256dh,
        push_auth:     authKey,
        updated_at:    new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Could not save push subscription." });
  }
});

// ─── admin routes ────────────────────────────────────────────────────────────

const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

/** GET /api/admin/notifications?page=1 — all recent notifications */
adminRouter.get("/", async (req, res) => {
  try {
    const page   = clamp(req.query.page, 1, 500, 1);
    const offset = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, type, title, message, read, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    return res.json({ notifications: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
  } catch (err) {
    return res.status(500).json({ error: "Could not load notifications." });
  }
});

/** POST /api/admin/notifications/send — send a manual notification */
adminRouter.post("/send", async (req, res) => {
  try {
    const { recipientUserId, recipientRole, type, title, message, channels } = req.body ?? {};
    if (!title || !message) {
      return res.status(400).json({ error: "title and message are required." });
    }
    if (!recipientUserId && !recipientRole) {
      return res.status(400).json({ error: "Provide recipientUserId or recipientRole." });
    }

    const results = await sendNotification({
      type:            type || "admin_message",
      recipientUserId: recipientUserId || undefined,
      recipientRole:   recipientRole   || undefined,
      title,
      message,
      channels:        channels || ["inapp", "email"],
    });

    return res.json({ ok: true, results });
  } catch (err) {
    console.error("[notifications:admin:send]", err.message);
    return res.status(500).json({ error: "Could not send notification." });
  }
});

/** POST /api/admin/notifications/broadcast — broadcast to all users */
adminRouter.post("/broadcast", async (req, res) => {
  try {
    const { title, message, type, channels } = req.body ?? {};
    if (!title || !message) {
      return res.status(400).json({ error: "title and message are required." });
    }

    // Get all user IDs
    const { data: users } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .limit(1000);

    if (!users || users.length === 0) {
      return res.json({ ok: true, sent: 0 });
    }

    // Insert all notifications at once
    await supabaseAdmin.from("notifications").insert(
      users.map(u => ({
        user_id:  u.user_id,
        type:     type || "broadcast",
        title,
        message,
        metadata: { broadcast: true, sentBy: req.user.id },
      }))
    );

    return res.json({ ok: true, sent: users.length });
  } catch (err) {
    console.error("[notifications:admin:broadcast]", err.message);
    return res.status(500).json({ error: "Broadcast failed." });
  }
});

/** POST /api/admin/notifications/test — test a channel */
adminRouter.post("/test", async (req, res) => {
  try {
    const { channel, recipientEmail, recipientPhone } = req.body ?? {};
    if (!channel) return res.status(400).json({ error: "channel is required." });
    const result = await testChannel({
      channel,
      recipientUserId: req.user.id,
      recipientEmail,
      recipientPhone,
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: "Test failed." });
  }
});

/** GET /api/admin/notifications/config — show which channels are configured */
adminRouter.get("/config", async (req, res) => {
  return res.json({
    email: {
      configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      host: process.env.SMTP_HOST || null,
      from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
    },
    sms: {
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
      fromNumber: process.env.TWILIO_FROM_NUMBER || null,
    },
    whatsapp: {
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      fromNumber: process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_FROM_NUMBER || null,
    },
    push: {
      configured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      publicKey: process.env.VAPID_PUBLIC_KEY || null,
    },
  });
});

module.exports = { userRouter: router, adminRouter };
