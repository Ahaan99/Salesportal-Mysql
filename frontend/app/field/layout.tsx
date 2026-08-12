"use client";

import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BellRing,
  Calendar,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  Package,
  PackageSearch,
  ShieldHalf,
  ShoppingBag,
  TrendingUp,
  UserCircle,
  UserPlus,
  Users2,
  Wallet,
} from "lucide-react";
import { PortalShell, type NavItem } from "@/components/portal/shell";
import { ChatWidget } from "@/components/chat/chat-widget";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { useUser } from "@/hooks/use-user";

const nav: NavItem[] = [
  { label: "My Day",           href: "/field",                 icon: LayoutDashboard },
  { label: "Products",         href: "/field/products",        icon: Package },
  { label: "Sell Now",         href: "/field/sell",            icon: ShoppingBag },
  { label: "My Orders",        href: "/field/orders",          icon: PackageSearch },
  { label: "Earnings",         href: "/field/earnings",        icon: Wallet },
  { label: "Performance",      href: "/field/performance",     icon: BarChart3 },
  { label: "My Reports",       href: "/field/reports",         icon: TrendingUp },
  { label: "KYC Verification", href: "/field/kyc",             icon: ShieldHalf },
  { label: "CRM",              href: "/field/crm",             icon: Users2 },
  { label: "Leads",            href: "/field/leads",           icon: MapPin },
  { label: "Tasks",            href: "/field/crm/tasks",       icon: ClipboardList },
  { label: "Meetings",         href: "/field/crm/meetings",    icon: Calendar },
  { label: "Follow-ups",       href: "/field/crm/follow-ups",  icon: Bell },
  { label: "My Profile",       href: "/field/profile",         icon: UserCircle },
  { label: "Join the Force",   href: "/field/join",            icon: UserPlus },
  { label: "Notifications",    href: "/field/notifications",   icon: BellRing },
];

const titles: Record<string, string> = {
  "/field":                    "My Day",
  "/field/products":           "Product Catalogue",
  "/field/sell":               "Sell Now",
  "/field/orders":             "My Orders",
  "/field/earnings":           "Commission & Earnings",
  "/field/performance":        "Performance",
  "/field/reports":            "My Reports",
  "/field/kyc":                "KYC Verification",
  "/field/crm":                "CRM Overview",
  "/field/leads":              "CRM — Leads",
  "/field/crm/tasks":          "CRM — Tasks",
  "/field/crm/meetings":       "CRM — Meetings",
  "/field/crm/follow-ups":     "CRM — Follow-ups",
  "/field/profile":            "My Profile",
  "/field/join":               "Join the Force",
  "/field/notifications":      "Notification Settings",
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { displayName } = useUser();
  const title = titles[pathname] ?? "Field Sales Portal";
  return (
    <PortalShell
      nav={nav}
      title={title}
      roleLabel="Field Sales Portal"
      userName={displayName}
    >
      {children}
      <ChatWidget userName={displayName} />
      <AssistantWidget />
    </PortalShell>
  );
}
