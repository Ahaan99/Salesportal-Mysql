// Email OTP verification for new client / field signups.
// Codes are 6 digits, stored only as SHA-256 hashes, expire after 10 minutes,
// allow max 5 wrong attempts, and resends are throttled to one per 60s.
const crypto = require("crypto");
const { pool } = require("../config/db");
const { sendEmail } = require("../utils/notifications");

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(email, code) {
  return crypto
    .createHash("sha256")
    .update(`${email.toLowerCase()}:${code}`)
    .digest("hex");
}

function toMysqlDatetime(ms) {
  return new Date(ms).toISOString().slice(0, 23).replace("T", " ");
}

/** Generate + store + email a fresh OTP. Returns { ok } or { error, retryInMs }. */
async function sendOtp(email) {
  const normalized = email.trim().toLowerCase();

  const [existing] = await pool.query(
    "SELECT last_sent_at FROM email_otps WHERE email = ?",
    [normalized]
  );
  if (existing[0]) {
    const since = Date.now() - new Date(existing[0].last_sent_at).getTime();
    if (since < RESEND_COOLDOWN_MS) {
      return {
        error: "Please wait a minute before requesting another code.",
        retryInMs: RESEND_COOLDOWN_MS - since,
      };
    }
  }

  // crypto-secure 6 digit code, never starts with 0 being stripped
  const code = String(crypto.randomInt(100000, 1000000));
  const now = Date.now();

  await pool.query(
    `INSERT INTO email_otps (email, code_hash, expires_at, attempts, last_sent_at)
     VALUES (?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash),
       expires_at = VALUES(expires_at), attempts = 0, last_sent_at = VALUES(last_sent_at)`,
    [normalized, hashCode(normalized, code), toMysqlDatetime(now + OTP_TTL_MS), toMysqlDatetime(now)]
  );

  const sent = await sendEmail({
    recipientEmail: normalized,
    title: `${code} is your Recruweb verification code`,
    message:
      `Use this code to verify your email and finish setting up your Recruweb account:` +
      `<span style="display:block;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:18px 0;font-family:monospace;color:#0f172a">${code}</span>` +
      `This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.`,
  });
  if (sent.status !== "sent") {
    console.error("[otp] email send failed:", sent.reason || sent.error);
    return { error: "Could not send the verification email. Please try again." };
  }
  return { ok: true };
}

/** Check a submitted code. Returns { ok } or { error }. Deletes the OTP on success. */
async function verifyOtp(email, code) {
  const normalized = email.trim().toLowerCase();
  const submitted = String(code || "").trim();
  if (!/^\d{6}$/.test(submitted)) {
    return { error: "Enter the 6-digit code from your email." };
  }

  const [rows] = await pool.query(
    "SELECT code_hash, expires_at, attempts FROM email_otps WHERE email = ?",
    [normalized]
  );
  const row = rows[0];
  if (!row) return { error: "No code was requested for this email. Please resend." };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { error: "That code has expired. Please request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { error: "Too many wrong attempts. Please request a new code." };
  }

  const matches = crypto.timingSafeEqual(
    Buffer.from(row.code_hash, "hex"),
    Buffer.from(hashCode(normalized, submitted), "hex")
  );
  if (!matches) {
    await pool.query("UPDATE email_otps SET attempts = attempts + 1 WHERE email = ?", [normalized]);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return {
      error: left > 0
        ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "Too many wrong attempts. Please request a new code.",
    };
  }

  await pool.query("DELETE FROM email_otps WHERE email = ?", [normalized]);
  return { ok: true };
}

module.exports = { sendOtp, verifyOtp };
