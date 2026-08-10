// JWT + bcrypt auth against the MySQL `users` table — replaces Supabase Auth.
// Token payload: { sub, email, role, name, cat } signed HS256 with JWT_SECRET.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_ROUNDS = 12;

/** Super-admin lockdown: "admin" is only honored for ADMIN_EMAIL. */
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in backend/.env — auth cannot start.");
}

function effectiveRole(role, email) {
  if (role === "admin" && (!ADMIN_EMAIL || (email || "").toLowerCase() !== ADMIN_EMAIL)) {
    console.error(
      `[auth] SECURITY: account ${email} claims role=admin but is not ADMIN_EMAIL — demoting to client.`
    );
    return "client";
  }
  return role;
}

/**
 * Create a user (auto-confirmed). For role=field also creates the profiles row
 * (this replaces the old Postgres on-signup trigger).
 * Returns { user } or throws { code: "email_exists" } style errors.
 */
async function createUser({ email, password, fullName, role, sellerCategory, requireEmailVerification = false }) {
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    try {
      // When verification is required the account starts unconfirmed
      // (email_confirmed_at NULL) and login stays blocked until the user
      // enters the 6-digit OTP emailed to them.
      await conn.query(
        `INSERT INTO users (id, email, password_hash, full_name, role, email_confirmed_at)
         VALUES (?, ?, ?, ?, ?, ${requireEmailVerification ? "NULL" : "UTC_TIMESTAMP(3)"})`,
        [id, email, hash, fullName, role]
      );
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") {
        const err = new Error("email already registered");
        err.code = "email_exists";
        throw err;
      }
      throw e;
    }
    if (role === "field") {
      await conn.query(
        `INSERT INTO profiles (user_id, full_name, seller_category) VALUES (?, ?, ?)`,
        [id, fullName, sellerCategory === "independent" ? "independent" : "field"]
      );
    }
    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
  return { user: { id, email, fullName, role } };
}

/** Fetch seller_category for field users (kept out of the hot login path errors). */
async function sellerCategoryOf(userId) {
  const [rows] = await pool.query(
    "SELECT seller_category FROM profiles WHERE user_id = ?",
    [userId]
  );
  return rows[0]?.seller_category ?? null;
}

/**
 * Verify credentials and issue a JWT.
 * Returns { token, user } or null on bad credentials (caller replies generically).
 */
async function login(email, password) {
  const [rows] = await pool.query(
    `SELECT id, email, password_hash, full_name, role, email_confirmed_at
     FROM users WHERE email = ?`,
    [email.toLowerCase()]
  );
  const row = rows[0];
  // Constant-ish time: always run a bcrypt compare even when no user found.
  const hash = row?.password_hash || "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZUhox0aQCT0sYRlObDsw2lLoccu0fu";
  const match = await bcrypt.compare(password, hash);
  if (!row || !match) return null;
  // Correct password but email not yet verified: tell the controller so it
  // can restart the OTP flow instead of showing "invalid credentials".
  if (!row.email_confirmed_at) return { unverified: true, email: row.email };

  return issueSession(row);
}

/** Build the JWT + user payload for an already-authenticated user row. */
async function issueSession(row) {
  const role = effectiveRole(row.role, row.email);
  const cat = role === "field" ? await sellerCategoryOf(row.id) : null;

  const token = jwt.sign(
    {
      sub: row.id,
      email: row.email,
      role,
      name: row.full_name || row.email,
      ...(cat ? { cat } : {}),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  pool
    .query("UPDATE users SET last_sign_in_at = UTC_TIMESTAMP(3) WHERE id = ?", [row.id])
    .catch(() => {});

  return {
    token,
    user: {
      id: row.id,
      email: row.email,
      role,
      fullName: row.full_name || row.email,
      sellerCategory: cat,
    },
  };
}

/**
 * Verify a JWT and return the req.user shape used across the app,
 * with the admin lockdown re-applied on every request.
 * Throws on invalid/expired tokens.
 */
function verifyToken(token) {
  const payload = jwt.verify(token, JWT_SECRET); // throws on bad/expired
  const role = effectiveRole(payload.role, payload.email);
  return {
    id: payload.sub,
    email: payload.email,
    role,
    fullName: payload.name || payload.email,
    sellerCategory: payload.cat ?? null,
  };
}

module.exports = { createUser, login, verifyToken, issueSession };
