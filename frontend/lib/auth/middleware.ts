// Session middleware for the JWT auth system (replaces lib/supabase/proxy).
// Verifies the HttpOnly session cookie with jose (Edge-compatible) and
// enforces portal routing:
//   - unauthenticated → /auth/login?next=...
//   - wrong portal for role → own portal home
//   - authed users bounced off the auth pages
//
// SUPER ADMIN LOCKDOWN is applied inside verifySessionToken(): "admin" is
// only honored for ADMIN_EMAIL (server-side env — never in the browser).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { portalOf, roleHome } from "@/lib/auth/roles";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await verifySessionToken(token); // null when absent/invalid/expired

  const pathname = request.nextUrl.pathname;
  const portal = portalOf(pathname);

  // Not logged in and trying to access a portal → login
  if (portal && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    if (token) {
      // Invalid/expired cookie — clear it so we don't loop through this
      // verification on every request.
      redirect.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    }
    return redirect;
  }

  // Logged in but visiting a portal that doesn't match their role → own portal
  if (portal && user) {
    const home = roleHome(user.role);
    if (portalOf(home) !== portal) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Logged in users don't need the auth pages (except callback/error)
  if (user && (pathname === "/auth/login" || pathname === "/auth/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = roleHome(user.role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Portal pages carry per-user protected content: forbid ALL caching so
  // the browser back button / bfcache / shared proxies can never replay a
  // protected page after logout or session expiry.
  if (portal) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
  }

  return response;
}
