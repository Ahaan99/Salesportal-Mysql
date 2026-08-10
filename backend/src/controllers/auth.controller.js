const { createUser, login: loginService, issueSession } = require("../services/authService");
const { sendOtp, verifyOtp } = require("../services/otpService");

// Admin accounts are provisioned via db/create-admin.js — never via public signup.
const VALID_ROLES = ["client", "field"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The one reserved super-admin identity (backend/.env → ADMIN_EMAIL). */
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_DOMAIN = ADMIN_EMAIL.includes("@") ? ADMIN_EMAIL.split("@")[1] : "";

/**
 * Normalize an email for reserved-identity comparison:
 *  - lowercase
 *  - strip plus-tag aliases ("admin+x@d.com" → "admin@d.com")
 * so alias tricks cannot slip past the exact-match guard.
 */
function normalizeEmail(email) {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
}

/**
 * True when a signup email impersonates the super-admin identity:
 *  - exactly the reserved address (after normalization), OR
 *  - on the SAME domain as the admin with "admin" anywhere in the
 *    local part (e.g. "test.admin@...", "admin1@...", "super-admin@...").
 * External domains are unaffected — a legit "admin@other-company.com"
 * client can still register.
 */
function impersonatesAdmin(email) {
  if (!ADMIN_EMAIL) return false;
  const normalized = normalizeEmail(email);
  if (normalized === ADMIN_EMAIL) return true;
  const [local = "", domain = ""] = normalized.split("@");
  return domain === ADMIN_DOMAIN && local.includes("admin");
}

// Seller categories for the "field" role — how the person wants to sell:
//   'field'       : Field Sales Person (territory beat, targets)
//   'independent' : Independent Seller (anyone can join and sell)
const VALID_SELLER_CATEGORIES = ["field", "independent"];

/**
 * POST /api/auth/signup
 * Creates the user directly in MySQL (bcrypt hash, auto-confirmed).
 * No confirmation email is ever sent.
 */
async function signup(req, res) {
  const { fullName, email, password, role, sellerCategory } = req.body || {};

  // --- validation -----------------------------------------------------
  const name = typeof fullName === "string" ? fullName.trim() : "";
  const mail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!name || name.length < 2) {
    return res.status(400).json({ error: "Please enter your full name." });
  }
  if (!EMAIL_RE.test(mail)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: "Please choose a valid role." });
  }

  // Optional seller category (only meaningful for the "field" role).
  let category = null;
  if (role === "field") {
    category = typeof sellerCategory === "string" && sellerCategory.trim() !== ""
      ? sellerCategory.trim()
      : "field";
    if (!VALID_SELLER_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "Please choose a valid seller category." });
    }
  }

  // --- reserved identity guard ----------------------------------------
  // Nobody may register the super-admin identity or any lookalike of it —
  // same 409 message as a duplicate email so the reserved address is not
  // disclosed to probing users.
  if (impersonatesAdmin(mail)) {
    return res.status(409).json({
      error: "This email is already registered. Try signing in instead.",
    });
  }

  // --- create user (unconfirmed - must verify email with a 6-digit OTP) ---
  try {
    const { user } = await createUser({
      email: mail,
      password,
      fullName: name,
      role,
      sellerCategory: category,
      requireEmailVerification: true,
    });

    const otp = await sendOtp(mail);
    if (otp.error) {
      // Account exists but the email failed - the user can hit resend
      // from the verification screen.
      console.error("[recruweb-backend] signup OTP send failed for", mail);
    }

    return res.status(201).json({
      requiresVerification: true,
      email: mail,
      user: { id: user.id, email: user.email, fullName: name, role },
    });
  } catch (error) {
    if (error.code === "email_exists") {
      return res.status(409).json({
        error: "This email is already registered. Try signing in instead.",
      });
    }
    console.error("[recruweb-backend] signup failed:", error.code, error.message);
    return res.status(500).json({ error: "Could not create your account. Please try again." });
  }
}

/**
 * POST /api/auth/login
 * Verifies credentials against MySQL and returns { token, user }.
 * The frontend stores the JWT and sends it as "Authorization: Bearer <token>".
 */
async function login(req, res) {
  const { email, password } = req.body || {};
  const mail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!EMAIL_RE.test(mail) || typeof password !== "string" || password.length < 1) {
    return res.status(400).json({ error: "Please enter your email and password." });
  }

  try {
    const result = await loginService(mail, password);
    if (!result) {
      // Generic message — never disclose whether the email exists.
      return res.status(401).json({ error: "Invalid email or password." });
    }
    if (result.unverified) {
      // Password was correct but the email is not verified yet - restart
      // the OTP flow so the user can finish verification.
      await sendOtp(result.email).catch(() => {});
      return res.status(403).json({
        requiresVerification: true,
        email: result.email,
        error: "Please verify your email first. We've sent a new code to your inbox.",
      });
    }
    return res.json(result); // { token, user: { id, email, role, fullName, sellerCategory } }
  } catch (error) {
    console.error("[recruweb-backend] login failed:", error.message);
    return res.status(500).json({ error: "Could not sign you in. Please try again." });
  }
}

/**
 * GET /api/auth/me  (behind requireAuth)
 * Returns the user derived from the verified JWT — used by the frontend
 * to restore the session on page load.
 */
async function me(req, res) {
  // The JWT snapshots the name at login time; profile edits update the
  // database afterwards, so always read the current name from the DB.
  try {
    const { pool } = require("../config/db");
    const [rows] = await pool.query(
      "SELECT full_name, email, role FROM users WHERE id = ? LIMIT 1",
      [req.user.sub || req.user.id]
    );
    const fresh = rows[0];
    if (fresh) {
      return res.json({
        user: {
          ...req.user,
          fullName: fresh.full_name,
          full_name: fresh.full_name,
          email: fresh.email,
          role: fresh.role,
        },
      });
    }
  } catch (err) {
    console.error("[auth:me] fresh lookup failed:", err.message);
  }
  return res.json({ user: req.user });
}

/**
 * POST /api/auth/verify-otp  { email, code }
 * Confirms the email with the 6-digit code, marks the account verified,
 * and signs the user in (returns the same payload as /login).
 */
async function verifyEmailOtp(req, res) {
  const { email, code } = req.body || {};
  const mail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(mail)) {
    return res.status(400).json({ error: "Please provide a valid email." });
  }

  try {
    const result = await verifyOtp(mail, code);
    if (result.error) return res.status(400).json({ error: result.error });

    const { pool } = require("../config/db");
    await pool.query(
      "UPDATE users SET email_confirmed_at = UTC_TIMESTAMP(3) WHERE email = ? AND email_confirmed_at IS NULL",
      [mail]
    );
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ? LIMIT 1", [mail]);
    if (!rows[0]) return res.status(400).json({ error: "Account not found." });

    // Verified - sign them straight in.
    const session = await issueSession(rows[0]);
    return res.json(session);
  } catch (error) {
    console.error("[recruweb-backend] verify-otp failed:", error.message);
    return res.status(500).json({ error: "Could not verify the code. Please try again." });
  }
}

/**
 * POST /api/auth/resend-otp  { email }
 * Sends a fresh code (rate limited to one per minute per email).
 * Always responds 200 for unknown/already-verified emails so the endpoint
 * cannot be used to probe which accounts exist.
 */
async function resendOtp(req, res) {
  const { email } = req.body || {};
  const mail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(mail)) {
    return res.status(400).json({ error: "Please provide a valid email." });
  }

  try {
    const { pool } = require("../config/db");
    const [rows] = await pool.query(
      "SELECT id FROM users WHERE email = ? AND email_confirmed_at IS NULL LIMIT 1",
      [mail]
    );
    if (rows[0]) {
      const result = await sendOtp(mail);
      if (result.error) return res.status(429).json({ error: result.error });
    }
    return res.json({ ok: true, message: "If that account needs verification, a new code is on its way." });
  } catch (error) {
    console.error("[recruweb-backend] resend-otp failed:", error.message);
    return res.status(500).json({ error: "Could not resend the code. Please try again." });
  }
}

module.exports = { signup, login, me, verifyEmailOtp, resendOtp };
