"use client";

import { usePathname } from "next/navigation";
import {
  BadgeIndianRupee,
  BarChart3,
  Bell,
  Building2,
  LayoutDashboard,
  MessagesSquare,
  PackageSearch,
  ShieldCheck,
  ShieldHalf,
  UsersRound,
} from "lucide-react";
import { PortalShell, type NavItem } from "@/components/portal/shell";

const nav: NavItem[] = [
  { label: "Command Center",      href: "/admin",                icon: LayoutDashboard },
  { label: "Sales Verifications", href: "/admin/verifications",  icon: ShieldCheck },
  { label: "KYC Review",          href: "/admin/kyc",            icon: ShieldHalf },
  { label: "Reports & Analytics", href: "/admin/reports",        icon: BarChart3 },
  { label: "Commissions",         href: "/admin/commissions",    icon: BadgeIndianRupee },
  { label: "Clients",             href: "/admin/clients",        icon: Building2 },
  { label: "Product Reviews",     href: "/admin/products",       icon: PackageSearch },
  { label: "Field Force",         href: "/admin/officers",       icon: UsersRound },
  { label: "Support Inbox",       href: "/admin/inbox",          icon: MessagesSquare },
  { label: "Notifications",       href: "/admin/notifications",  icon: Bell },
];

const titles: Record<string, string> = {
  "/admin":                "Command Center",
  "/admin/verifications":  "Sales Verifications",
  "/admin/kyc":            "KYC Review",
  "/admin/reports":        "Reports & Analytics",
  "/admin/commissions":    "Commission Management",
  "/admin/clients":        "Clients",
  "/admin/products":       "Product Reviews",
  "/admin/officers":       "Field Force",
  "/admin/inbox":          "Support Inbox",
  "/admin/notifications":  "Notifications",
};

/**
 * Client-side chrome for the admin portal. Auth does NOT live here — the
 * server layout (app/admin/layout.tsx) verifies the Super Admin session
 * before this component is ever rendered, and passes the verified display
 * name down as a prop (no client auth fetch, no name flash).
 */
export function AdminShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const title = titles[pathname] ?? "Admin";
  return (
    <PortalShell
      nav={nav}
      title={title}
      roleLabel="Admin Portal"
      userName={userName}
    >
      {children}
    </PortalShell>
  );
}
