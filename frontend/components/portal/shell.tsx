"use client";

    import { useState } from "react";
    import Link from "next/link";
    import { usePathname, useRouter } from "next/navigation";
    import { LogOut, Menu, X, type LucideIcon } from "lucide-react";
    import { Avatar } from "@/components/ui/avatar";
    import { NotificationBell } from "@/components/notifications/notification-bell";
    import { logoutAction } from "@/app/auth/login/actions";
    import { cn } from "@/lib/utils";

    export interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    }

    export function PortalShell({
    title,
    roleLabel,
    userName,
    nav,
    children,
    }: {
    title: string;
    roleLabel: string;
    userName: string;
    nav: NavItem[];
    children: React.ReactNode;
    }) {
    const pathname = usePathname();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    async function handleSignOut() {
      if (signingOut) return; // double-click guard
      setSigningOut(true);
      try {
        // Server action clears the HttpOnly rw_session cookie — the token
        // is stateless (JWT), so removing the cookie IS the logout.
        await logoutAction();
      } catch {
        // Never strand the user in the portal because sign-out errored.
      } finally {
        // Hard navigation (not router.push): tears down all client state and
        // guarantees the next document goes through middleware with the
        // cleared cookies — no stale RSC cache, no bfcache replay.
        window.location.replace("/auth/login");
      }
    }

    const sidebar = (
      <div className="flex h-full flex-col bg-ink text-ink-foreground">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-lg text-accent-foreground">
            R
          </span>
          <div>
            <p className="font-serif text-lg leading-none">Recruweb</p>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-ink-muted">
              {roleLabel}
            </p>
          </div>
        </div>

        <nav
          className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-2"
          aria-label={`${roleLabel} navigation`}
        >
          {nav.map((item) => {
            // Longest-prefix match: only ONE item is ever active, so CRM
            // sub-pages (Tasks/Meetings/Follow-ups) don't also light up "CRM".
            const matches = nav.filter(
              (n) => pathname === n.href || pathname.startsWith(n.href + "/")
            );
            const best = matches.reduce(
              (a, b) => (b.href.length > (a?.href.length ?? 0) ? b : a),
              undefined as NavItem | undefined
            );
            const active = best?.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-ink-muted hover:bg-ink-soft hover:text-ink-foreground"
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3 border-t border-ink-muted/20 px-5 py-4">
          <Avatar seed={userName} online />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="text-xs text-ink-muted">{roleLabel}</p>
          </div>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-ink-soft hover:text-ink-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    );

    return (
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Close menu"
              className="absolute inset-0 bg-ink/50"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/85 px-5 backdrop-blur-md md:px-8">
            <div className="flex items-center gap-3">
              <button
                className="rounded-lg p-2 text-foreground hover:bg-secondary lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <span className="hidden rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground md:block">
                {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
          </header>
          <main className="flex-1 px-5 py-7 md:px-8">{children}</main>
        </div>
      </div>
    );
    }
    