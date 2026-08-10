// Server-only module: pulls in next/headers via lib/auth/session.
import { redirect } from "next/navigation";
import { getSessionUser, effectiveRole, type SessionUser } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/roles";

export { effectiveRole };
export type { SessionUser };

/**
 * Server-side auth guards — the defense-in-depth layer BEHIND the
 * middleware. Middleware already redirects unauthenticated traffic, but
 * these guards re-verify the JWT inside the server render itself, so
 * protected content can never be produced without a valid session
 * (covers static-generation edge cases, misconfigured matchers, and any
 * future route that forgets middleware coverage).
 *
 * SUPER ADMIN LOCKDOWN lives in lib/auth/session.ts (effectiveRole):
 * "admin" is only honored for ADMIN_EMAIL; when unset we fail closed.
 */

/**
 * Requires a valid, cryptographically verified session (HMAC check of the
 * HttpOnly JWT cookie — never trusts the cookie payload without verifying
 * the signature). Redirects to login when absent.
 */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = nextPath
      ? `/auth/login?next=${encodeURIComponent(nextPath)}`
      : "/auth/login";
    redirect(target);
  }
  return user;
}

/**
 * Requires a session AND the legitimate Super Admin identity.
 * Non-admin users are bounced to their own portal home — never shown
 * admin content, not even for a frame.
 */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") {
    redirect(roleHome(user.role));
  }
  return user;
}
