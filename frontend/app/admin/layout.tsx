import { requireSuperAdmin } from "@/lib/auth/guard";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { AdminShell } from "./admin-shell";

/**
 * Server layout for EVERY /admin route — the defense-in-depth gate behind
 * the middleware:
 *
 *  - `requireSuperAdmin()` revalidates the session against the Supabase
 *    auth server (never trusts cookie contents) and enforces the
 *    ADMIN_EMAIL lockdown. Unauthenticated → /auth/login?next=/admin.
 *    Authenticated non-admin → their own portal. Redirects fire during the
 *    server render, so protected markup is never produced, streamed, or
 *    flashed to an unauthorized browser.
 *
 *  - `force-dynamic` opts the whole subtree out of static generation:
 *    admin pages can never be pre-rendered at build time (when no session
 *    exists) or served from a shared cache.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSuperAdmin();

  const displayName =
    user.fullName || user.email?.split("@")[0] || "Admin";

  return (
    <AdminShell userName={displayName}>
      {children}
      <AssistantWidget />
    </AdminShell>
  );
}
