import type { PortalRole } from "@/lib/auth/roles";

// Same-origin path proxied to the Express backend by the Next.js
// rewrite in next.config.mjs — immune to CORS and host/port mismatches.
// Set NEXT_PUBLIC_API_URL only if the backend is deployed on another domain.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/backend";

/** How a sales person sells: assigned territory vs. anywhere. */
export type SellerCategory = "field" | "independent";

export interface SignUpPayload {
  fullName: string;
  email: string;
  password: string;
  role: PortalRole;
  /** Only meaningful when role === "field". Defaults to "field" server-side. */
  sellerCategory?: SellerCategory;
}

export interface SignUpResult {
  ok: boolean;
  error?: string;
}

/**
 * Creates the account through the Recruweb backend (MySQL + bcrypt).
 * The account is auto-confirmed — no confirmation email, no rate limit.
 */
export async function signUpUser(payload: SignUpPayload): Promise<SignUpResult> {
  try {
    const res = await fetch(`${API_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      // A rewrite that can't reach the backend surfaces as a 5xx with no JSON body.
      if (!body.error && res.status >= 500) {
        return {
          ok: false,
          error:
            "Cannot reach the Recruweb API. Make sure the backend server is running (npm run dev inside the backend folder).",
        };
      }
      return { ok: false, error: body.error ?? "Could not create your account." };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Cannot reach the Recruweb API. Make sure the backend server is running (npm run dev inside the backend folder).",
    };
  }
}
