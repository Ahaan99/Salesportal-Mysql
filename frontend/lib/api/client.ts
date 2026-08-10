"use client";

// Same-origin `/backend` path is proxied to Express by next.config.mjs.
// NEXT_PUBLIC_API_URL overrides it (e.g. a devtunnels URL when sharing).
// Trailing slashes are stripped so both ".ms/" and ".ms" work.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/backend").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const NETWORK_MSG =
  "Cannot reach the Recruweb API. Make sure the backend server is running (npm run dev inside the backend folder).";

/**
 * Authenticated JSON request to the Recruweb backend.
 *
 * Auth: the HttpOnly `rw_session` JWT cookie is sent automatically by the
 * browser on this same-origin request (the /backend rewrite keeps it
 * same-origin) — client JS never sees or handles the token.
 *
 * Throws ApiError with a human-readable message (and per-field errors
 * for 422 validation responses).
 */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(NETWORK_MSG, 0);
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      // Session expired mid-use — bounce to login with a return path.
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/auth/login?next=${next}`;
    }
    const message =
      body?.error ?? (res.status >= 500 ? NETWORK_MSG : "Something went wrong.");
    throw new ApiError(message, res.status, body?.fields);
  }

  return body as T;
}

/** SWR-compatible fetcher: useSWR(path, apiFetcher) */
export const apiFetcher = <T,>(path: string) => api<T>(path);
