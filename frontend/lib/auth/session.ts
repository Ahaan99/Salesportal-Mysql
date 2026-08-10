// Server-only session helpers for the JWT auth system (replaces Supabase).
// The Express backend signs an HS256 JWT; the login server action stores it
// in an HttpOnly cookie. This module verifies that cookie with `jose`
// (Edge-compatible, so middleware can use it too).
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { PortalRole } from "@/lib/auth/roles";

export const SESSION_COOKIE = "rw_session";

/** Shape of the verified session user used across server components. */
export interface SessionUser {
  id: string;
  email: string;
  role: PortalRole | string;
  fullName: string;
  sellerCategory: "field" | "independent" | null;
}

/**
 * SUPER ADMIN LOCKDOWN (mirror of backend/src/services/authService.js):
 * "admin" is only honored for the account whose email matches ADMIN_EMAIL.
 * Server-only env var — never shipped to the browser. Unset → fail closed.
 */
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

function secretKey(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn("[auth] JWT_SECRET missing in frontend/.env.local — sessions disabled.");
    return null;
  }
  return new TextEncoder().encode(secret);
}

/** Demote illegitimate admin claims (defense-in-depth over the backend). */
export function effectiveRole(user: Pick<SessionUser, "role" | "email">): PortalRole | string {
  if (user.role === "admin") {
    const email = (user.email || "").toLowerCase();
    if (!ADMIN_EMAIL || email !== ADMIN_EMAIL) return "client";
  }
  return user.role || "client";
}

/**
 * Verify a raw JWT and return the session user, or null when the token is
 * missing/invalid/expired. Never throws.
 */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const user: SessionUser = {
      id: String(payload.sub ?? ""),
      email: String(payload.email ?? ""),
      role: String(payload.role ?? "client"),
      fullName: String(payload.name ?? payload.email ?? ""),
      sellerCategory: (payload.cat as SessionUser["sellerCategory"]) ?? null,
    };
    if (!user.id || !user.email) return null;
    user.role = effectiveRole(user);
    return user;
  } catch {
    return null;
  }
}

/** Read + verify the session cookie (server components / actions / routes). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}
