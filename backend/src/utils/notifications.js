/**
 * Recruweb Notification Service
 * ──────────────────────────────
 * Channels: in-app (DB), email (nodemailer), SMS (Twilio), WhatsApp (Twilio), push (web-push)
 * All external channels are graceful — they silently skip if env vars are missing.
 *
 * Usage:
 *   const { sendNotification } = require("./notifications");
 *   await sendNotification({
 *     type: "kyc_approved",
 *     recipientUserId: "uuid-...",
 *     title: "KYC Approved",
 *     message: "Your KYC has been verified.",
 *     channels: ["inapp", "email"],
 *   });
 */

"use strict";

const https  = require("https");
const { URL }           = require("url");
const { supabaseAdmin } = require("../config/supabase");

// ─── helpers ────────────────────────────────────────────────────────────────

function tryRequire(mod) {
  try { return require(mod); } catch { return null; }
}

// ─── in-app ─────────────────────────────────────────────────────────────────

/**
 * Store a notification row for a specific user OR a role broadcast.
 * recipientUserId → personal notification
 * recipientRole   → all users with that role (admin can see it)
 */
async function storeInApp({ recipientUserId, recipientRole, type, title, message, metadata }) {
  try {
    if (recipientUserId) {
      // Personal notification
      await supabaseAdmin.from("notifications").insert({
        user_id:   recipientUserId,
        type, title, message,
        metadata:  metadata ?? null,
      });
    } else if (recipientRole) {
      // Role-broadcast: look up all users with this role and fan-out
      const { data: users } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("role", recipientRole)
        .limit(500);

      if (users && users.length > 0) {
        await supabaseAdmin.from("notifications").insert(
          users.map(u => ({
            user_id:  u.user_id,
            type, title, message,
            metadata: metadata ?? null,
          }))
        );
      } else {
        // Fallback: store with user_role for admin to see
        await supabaseAdmin.from("notifications").insert({
          user_id:   null,
          user_role: recipientRole,
          type, title, message,
          metadata:  metadata ?? null,
        });
      }
    }
  } catch (err) {
    console.error("[notifications:inapp]", err.message);
  }
}

// ─── email ──────────────────────────────────────────────────────────────────

async function getRecipientEmail(userId) {
  if (!userId) return null;
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function sendEmail({ recipientUserId, recipientEmail, title, message }) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromAddr = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    // Email not configured — skip silently
    return { channel: "email", status: "skipped", reason: "SMTP not configured" };
  }

  const nodemailer = tryRequire("nodemailer");
  if (!nodemailer) {
    return { channel: "email", status: "skipped", reason: "nodemailer not installed (run: npm install nodemailer)" };
  }

  try {
    const toEmail = recipientEmail || (recipientUserId ? await getRecipientEmail(recipientUserId) : null);
    if (!toEmail) return { channel: "email", status: "skipped", reason: "no recipient email" };

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"Recruweb" <${fromAddr}>`,
      to:   toEmail,
      subject: title,
      text: message,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:20px;margin:0">Recruweb</h1>
          </div>
          <div style="background:#f8fafc;padding:28px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
            <h2 style="color:#0f172a;font-size:18px;margin:0 0 12px">${title}</h2>
            <p style="color:#475569;line-height:1.6;margin:0">${message}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
            <p style="color:#94a3b8;font-size:12px;margin:0">Recruweb Sales Portal · You are receiving this because you have an account on Recruweb.</p>
          </div>
        </div>`,
    });
    return { channel: "email", status: "sent", to: toEmail };
  } catch (err) {
    console.error("[notifications:email]", err.message);
    return { channel: "email", status: "error", error: err.message };
  }
}

// ─── SMS / WhatsApp via Twilio ───────────────────────────────────────────────

async function getRecipientPhone(userId) {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("phone")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.phone ?? null;
}

function twilioRequest(from, to, body, isWhatsApp = false) {
  return new Promise((resolve, reject) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return resolve({ skipped: true, reason: "Twilio credentials not configured" });
    }

    const fromAddr = isWhatsApp ? `whatsapp:${from}` : from;
    const toAddr   = isWhatsApp ? `whatsapp:${to}`   : to;

    const postData = new URLSearchParams({ From: fromAddr, To: toAddr, Body: body }).toString();
    const options = {
      hostname: "api.twilio.com",
      path:     `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method:   "POST",
      headers: {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        "Authorization":  "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end",  () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true, sid: json.sid });
          else reject(new Error(json.message || `Twilio ${res.statusCode}`));
        } catch { reject(new Error("Twilio parse error")); }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function sendSms({ recipientUserId, recipientPhone, message }) {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from || !process.env.TWILIO_ACCOUNT_SID) {
    return { channel: "sms", status: "skipped", reason: "Twilio not configured" };
  }
  try {
    const phone = recipientPhone || (recipientUserId ? await getRecipientPhone(recipientUserId) : null);
    if (!phone) return { channel: "sms", status: "skipped", reason: "no recipient phone" };
    const result = await twilioRequest(from, phone, message, false);
    if (result.skipped) return { channel: "sms", status: "skipped", reason: result.reason };
    return { channel: "sms", status: "sent", to: phone };
  } catch (err) {
    console.error("[notifications:sms]", err.message);
    return { channel: "sms", status: "error", error: err.message };
  }
}

async function sendWhatsApp({ recipientUserId, recipientPhone, message }) {
  const from = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_FROM_NUMBER;
  if (!from || !process.env.TWILIO_ACCOUNT_SID) {
    return { channel: "whatsapp", status: "skipped", reason: "Twilio not configured" };
  }
  try {
    const phone = recipientPhone || (recipientUserId ? await getRecipientPhone(recipientUserId) : null);
    if (!phone) return { channel: "whatsapp", status: "skipped", reason: "no recipient phone" };
    const result = await twilioRequest(from, phone, message, true);
    if (result.skipped) return { channel: "whatsapp", status: "skipped", reason: result.reason };
    return { channel: "whatsapp", status: "sent", to: phone };
  } catch (err) {
    console.error("[notifications:whatsapp]", err.message);
    return { channel: "whatsapp", status: "error", error: err.message };
  }
}

// ─── push notifications ─────────────────────────────────────────────────────

async function sendPush({ recipientUserId, title, message, metadata }) {
  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@recruweb.app";

  if (!vapidPublic || !vapidPrivate) {
    return { channel: "push", status: "skipped", reason: "VAPID keys not configured" };
  }

  const webpush = tryRequire("web-push");
  if (!webpush) {
    return { channel: "push", status: "skipped", reason: "web-push not installed (run: npm install web-push)" };
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const { data: settings } = await supabaseAdmin
      .from("notification_settings")
      .select("push_endpoint, push_p256dh, push_auth, push_enabled")
      .eq("user_id", recipientUserId)
      .maybeSingle();

    if (!settings?.push_enabled || !settings?.push_endpoint) {
      return { channel: "push", status: "skipped", reason: "user has no push subscription" };
    }

    const subscription = {
      endpoint: settings.push_endpoint,
      keys: { p256dh: settings.push_p256dh, auth: settings.push_auth },
    };
    const payload = JSON.stringify({ title, body: message, data: metadata });
    await webpush.sendNotification(subscription, payload);
    return { channel: "push", status: "sent" };
  } catch (err) {
    console.error("[notifications:push]", err.message);
    return { channel: "push", status: "error", error: err.message };
  }
}

// ─── main entrypoint ─────────────────────────────────────────────────────────

/**
 * Send a notification via the specified channels.
 * @param {object} opts
 * @param {string}   opts.type              - notification type key
 * @param {string}   [opts.recipientUserId] - target a specific user
 * @param {string}   [opts.recipientRole]   - broadcast to all users with this role (admin|field|client)
 * @param {string}   opts.title             - short title
 * @param {string}   opts.message           - longer message body
 * @param {object}   [opts.metadata]        - arbitrary extra data stored in JSONB
 * @param {string[]} [opts.channels]        - ["inapp","email","sms","whatsapp","push"] default: ["inapp"]
 */
async function sendNotification({
  type,
  recipientUserId,
  recipientRole,
  title,
  message,
  metadata,
  channels = ["inapp"],
}) {
  const results = [];

  if (channels.includes("inapp")) {
    await storeInApp({ recipientUserId, recipientRole, type, title, message, metadata });
    results.push({ channel: "inapp", status: "stored" });
  }
  if (channels.includes("email")) {
    results.push(await sendEmail({ recipientUserId, title, message }));
  }
  if (channels.includes("sms")) {
    results.push(await sendSms({ recipientUserId, message }));
  }
  if (channels.includes("whatsapp")) {
    results.push(await sendWhatsApp({ recipientUserId, message }));
  }
  if (channels.includes("push")) {
    results.push(await sendPush({ recipientUserId, title, message, metadata }));
  }

  return results;
}

/**
 * Send a test notification to verify a channel is working.
 */
async function testChannel({ channel, recipientUserId, recipientEmail, recipientPhone }) {
  const title   = "Recruweb Test Notification";
  const message = "This is a test notification from Recruweb. Your channel is working correctly.";

  switch (channel) {
    case "email":
      return sendEmail({ recipientUserId, recipientEmail, title, message });
    case "sms":
      return sendSms({ recipientUserId, recipientPhone, message });
    case "whatsapp":
      return sendWhatsApp({ recipientUserId, recipientPhone, message });
    case "push":
      return sendPush({ recipientUserId, title, message, metadata: { test: true } });
    default:
      return { channel, status: "error", error: "Unknown channel" };
  }
}

module.exports = { sendNotification, sendEmail, sendSms, sendWhatsApp, sendPush, testChannel };
