"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/roles";
import { sanitizeNextPath } from "@/lib/auth/redirect";

/**
 * Server-side login (zero-trust):
 *  - Credentials are verified server-to-server against the Express backend
 *    (MySQL + bcrypt). The browser never receives the raw password response;
 *    the JWT is stored in an HttpOnly/SameSite cookie set HERE — no tokens
 *    ever transit through client-side JS.
 *  - The post-login destination is computed from the VERIFIED token (role
 *    claim re-checked with the ADMIN_EMAIL lockdown), never from anything
 *    the client claims.
 *  - Generic error message for every credential failure — no account
 *    enumeration, no implementation details.
 *  - In-memory rate limiting bounds brute force / credential stuffing at
 *    this entry point (the Express /api limiter cannot see this route).
 */

const GENERIC_ERROR = "Incorrect email or password. Please try again.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Server-to-server base URL for the Express backend (same box in dev).
const BACKEND_URL = (process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:5000").replace(/\/+$/, "");

/** Session cookie lifetime — keep in sync with backend JWT_EXPIRES_IN (7d). */
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Rate limiting (sliding window, in-memory — single-node Next server).
//   * per-IP:            20 failed attempts / 15 min
//   * per-account+IP:     5 failed attempts / 15 min
// ---------------------------------------------------------------------------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 20;
const MAX_PER_ACCOUNT = 5;
const MAX_BUCKETS = 5000;

const attempts = new Map<string, number[]>();

function prune(key: string, now: number): number[] {
  const list = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length === 0) attempts.delete(key);
  else attempts.set(key, list);
  return list;
}

function isLimited(ip: string, email: string): boolean {
  const now = Date.now();
  return (
    prune(`ip:${ip}`, now).length >= MAX_PER_IP ||
    prune(`acct:${email}:${ip}`, now).length >= MAX_PER_ACCOUNT
  );
}

function recordFailure(ip: string, email: string) {
  const now = Date.now();
  while (attempts.size >= MAX_BUCKETS) {
    const oldest = attempts.keys().next().value;
    if (oldest === undefined) break;
    attempts.delete(oldest);
  }
  attempts.set(`ip:${ip}`, [...prune(`ip:${ip}`, now), now]);
  attempts.set(`acct:${email}:${ip}`, [...prune(`acct:${email}:${ip}`, now), now]);
}

function clearAccount(ip: string, email: string) {
  attempts.delete(`acct:${email}:${ip}`);
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") || "unknown";
}

/** Authenticate against the backend and set the session cookie.
 *  Returns the destination path on success, or null on bad credentials. */
async function authenticate(email: string, password: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    throw new Error("backend-unreachable");
  }

  if (!res.ok) {
    // 403 + requiresVerification = right password, unverified email.
    // The backend has already emailed a fresh code.
    if (res.status === 403) {
      const b = (await res.json().catch(() => null)) as
        | { requiresVerification?: boolean }
        | null;
      if (b?.requiresVerification) return "__unverified__";
    }
    return null;
  }

  const body = (await res.json().catch(() => null)) as { token?: string } | null;
  // Never trust the response blob — verify the JWT ourselves before
  // creating a session from it.
  const user = await verifySessionToken(body?.token);
  if (!body?.token || !user) return null;

  const store = await cookies();
  store.set(SESSION_COOKIE, body.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return roleHome(user.role);
}

export interface LoginState {
  error: string | null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  // --- server-side input validation (never trust the client) -------------
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const rawNext = formData.get("next");

  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { error: GENERIC_ERROR };
  }
  if (password.length < 1 || password.length > 1024) {
    return { error: GENERIC_ERROR };
  }

  // --- rate limiting -------------------------------------------------------
  const ip = await clientIp();
  if (isLimited(ip, email)) {
    return {
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    };
  }

  // --- authenticate on the server -----------------------------------------
  let home: string | null;
  try {
    home = await authenticate(email, password);
  } catch {
    return {
      error:
        "Cannot reach the Recruweb API. Make sure the backend server is running (npm run dev inside the backend folder).",
    };
  }

  if (!home) {
    recordFailure(ip, email);
    return { error: GENERIC_ERROR };
  }

  if (home === "__unverified__") {
    // Correct password, unverified email - finish OTP verification first.
    redirect(`/auth/verify-email?email=${encodeURIComponent(email)}`);
  }

  clearAccount(ip, email);

  // --- destination computed from the VERIFIED session ----------------------
  const next = sanitizeNextPath(typeof rawNext === "string" ? rawNext : null);
  const destination = next && next.startsWith(home) ? next : home;

  redirect(destination);
}

/**
 * Auto sign-in immediately after a successful signup (no rate-limit
 * bookkeeping needed — the account was literally just created).
 * Returns an error string, or redirects on success.
 */
export async function loginAfterSignup(
  email: string,
  password: string
): Promise<{ error: string } | never> {
  const mail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) return { error: GENERIC_ERROR };

  let home: string | null;
  try {
    home = await authenticate(mail, password);
  } catch {
    return {
      error:
        "Your account was created, but auto sign-in failed. Please sign in manually.",
    };
  }
  if (!home) {
    return {
      error:
        "Your account was created, but auto sign-in failed. Please sign in manually.",
    };
  }
  if (home === "__unverified__") {
    redirect(`/auth/verify-email?email=${encodeURIComponent(mail)}`);
  }
  redirect(home);
}

/**
 * Verify the 6-digit email OTP. On success the backend returns a session
 * token; we verify it ourselves, set the HttpOnly cookie, and redirect to
 * the user's portal home. Returns { error } when the code is wrong.
 */
export async function verifyOtpAction(
  email: string,
  code: string
): Promise<{ error: string } | never> {
  const mail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) return { error: "Please provide a valid email." };
  if (!/^\d{6}$/.test(code.trim())) {
    return { error: "Enter the 6-digit code from your email." };
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: mail, code: code.trim() }),
      cache: "no-store",
    });
  } catch {
    return {
      error:
        "Cannot reach the Recruweb API. Make sure the backend server is running.",
    };
  }

  const body = (await res.json().catch(() => null)) as
    | { token?: string; error?: string }
    | null;

  if (!res.ok) {
    return { error: body?.error ?? "Could not verify the code. Please try again." };
  }

  const user = await verifySessionToken(body?.token);
  if (!body?.token || !user) {
    return { error: "Verification succeeded but sign-in failed. Please sign in manually." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, body.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect(roleHome(user.role));
}

/** Ask the backend to email a fresh OTP (rate limited server-side). */
export async function resendOtpAction(
  email: string
): Promise<{ ok?: boolean; error?: string }> {
  const mail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) return { error: "Please provide a valid email." };

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: mail }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!res.ok) return { error: body?.error ?? "Could not resend the code." };
    return { ok: true };
  } catch {
    return { error: "Cannot reach the Recruweb API. Please try again." };
  }
}

/** Sign out: clear the session cookie. Client then hard-navigates to login. */
export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
