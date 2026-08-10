// JWT auth middleware — replaces the old Supabase getUser() round trip.
// Verification is a local HMAC check (jsonwebtoken), so there is no network
// call, no cache, and no timeout handling needed anymore.
//
// The token is accepted from either:
//   1. "Authorization: Bearer <jwt>"  (direct API clients), or
//   2. the HttpOnly "rw_session" cookie set by the Next.js login action —
//      the browser sends it automatically through the same-origin /backend
//      rewrite, so client JS never touches the token at all.
//
// SUPER ADMIN LOCKDOWN is enforced inside verifyToken(): the "admin" role is
// only honored for the account whose email matches ADMIN_EMAIL (backend/.env).
// Any other token claiming admin is demoted to "client" on every request.
const { verifyToken } = require("../services/authService");

const SESSION_COOKIE = "rw_session";

function tokenFromCookie(header) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : tokenFromCookie(req.headers.cookie);

    if (!token) {
      return res.status(401).json({ error: "Authentication required." });
    }

    try {
      req.user = verifyToken(token); // throws on invalid/expired
    } catch (_e) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    next();
  } catch (e) {
    next(e);
  }
}

/** Restrict a route to specific roles, e.g. requireRole("client", "admin") */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have access to this resource." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
