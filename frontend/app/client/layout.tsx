"use client";

import { usePathname } from "next/navigation";
import {
  Bell,
  Boxes,
  Building2,
  LayoutDashboard,
  Package,
  Rocket,
  RotateCcw,
  ShieldHalf,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { PortalShell, type NavItem } from "@/components/portal/shell";
import { ChatWidget } from "@/components/chat/chat-widget";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { VendorProvider } from "@/lib/store/vendor-store";
import { useUser } from "@/hooks/use-user";

const nav: NavItem[] = [
  { label: "Overview",              href: "/client",                  icon: LayoutDashboard },
  { label: "My Products",           href: "/client/products",         icon: Package },
  { label: "Inventory",             href: "/client/inventory",        icon: Boxes },
  { label: "Launch Product",        href: "/client/launch",           icon: Rocket },
  { label: "Orders",                href: "/client/orders",           icon: ShoppingCart },
  { label: "Returns & Refunds",     href: "/client/returns",          icon: RotateCcw },
  { label: "Field Sales",           href: "/client/performance",      icon: TrendingUp },
  { label: "KYC Verification",      href: "/client/kyc",              icon: ShieldHalf },
  { label: "Company Profile",       href: "/client/profile",          icon: Building2 },
  { label: "Notifications",         href: "/client/notifications",    icon: Bell },
];

const titles: Record<string, string> = {
  "/client":                  "Vendor Overview",
  "/client/products":         "My Products",
  "/client/inventory":        "Inventory",
  "/client/launch":           "Launch a Product",
  "/client/orders":           "Orders",
  "/client/returns":          "Returns & Refunds",
  "/client/performance":      "Field Sales Performance",
  "/client/kyc":              "KYC Verification",
  "/client/profile":          "Company Profile",
  "/client/notifications":    "Notification Settings",
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { displayName } = useUser();
  return (
    <VendorProvider>
      <PortalShell
        title={titles[pathname] ?? "Vendor Portal"}
        roleLabel="Vendor Portal"
        userName={displayName}
        nav={nav}
      >
        {children}
        <ChatWidget userName={displayName} />
        <AssistantWidget />
      </PortalShell>
    </VendorProvider>
  );
}
