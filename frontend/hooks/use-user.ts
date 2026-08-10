"use client";

import useSWR from "swr";

/** User shape returned by GET /api/auth/me (derived from the verified JWT). */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  fullName: string;
  sellerCategory: "field" | "independent" | null;
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/backend").replace(/\/+$/, "");

/**
 * Silent session probe — unlike lib/api/client.ts this NEVER redirects on
 * 401, because this hook also runs on public pages (e.g. the chat widget)
 * where "not signed in" is a perfectly valid state, not an error.
 */
async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { user?: AuthUser } | null;
  return body?.user ?? null;
}

/**
 * Exposes the current user by asking the backend to verify the HttpOnly
 * session cookie (GET /api/auth/me). SWR caches the result app-wide, so
 * every component using this hook shares one request and stays in sync.
 */
export function useUser() {
  const { data, isLoading } = useSWR<AuthUser | null>("auth:me", fetchMe, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const user = data ?? null;
  const displayName = user?.fullName || user?.email?.split("@")[0] || "Member";

  return { user, displayName, loading: isLoading };
}
