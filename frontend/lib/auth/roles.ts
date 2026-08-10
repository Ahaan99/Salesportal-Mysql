export type PortalRole = "client" | "field" | "admin";

export const ROLE_HOME: Record<PortalRole, string> = {
  client: "/client",
  field: "/field",
  admin: "/admin",
};

export const ROLE_LABELS: Record<PortalRole, string> = {
  client: "Vendor / Client",
  field: "Field Sales Officer",
  admin: "Super Admin",
};

export function isPortalRole(value: unknown): value is PortalRole {
  return value === "client" || value === "field" || value === "admin";
}

/** Resolve a user's portal home from Supabase user metadata. */
export function roleHome(role: unknown): string {
  return isPortalRole(role) ? ROLE_HOME[role] : "/client";
}

/** Which portal prefix a path belongs to, if any. */
export function portalOf(pathname: string): PortalRole | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/client" || pathname.startsWith("/client/")) return "client";
  if (pathname === "/field" || pathname.startsWith("/field/")) return "field";
  return null;
}
