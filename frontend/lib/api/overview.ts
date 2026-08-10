/**
 * OVERVIEW API — live dashboard data for the Admin and Client portals.
 * Replaces the old lib/data mock layer for the dashboard pages.
 */
import { apiFetcher } from "@/lib/api/client";

/* ------------------------------- shared -------------------------------- */

export interface OverviewOrder {
  id: string;
  order_no: string;
  product_name: string;
  customer_name: string;
  city: string | null;
  channel: "field" | "online";
  status: "processing" | "in-transit" | "delivered" | "returned" | "cancelled";
  qty?: number;
  amount: number;
  officer_name: string | null;
  placed_at: string;
}

export interface RegionStat {
  region: string;
  sales: number;
  officers: number;
  growth: number;
}

/* ---------------------------- admin overview ---------------------------- */

export interface AdminOverview {
  kpis: {
    gmv: number;
    gmvGrowth: number;
    revenueMonth: number;
    activeOfficers: number;
    liveClients: number;
    productsLive: number;
    productsReview: number;
    ordersTotal: number;
    ordersToday: number;
    commissionsPending: number;
    commissionsSettled: number;
  };
  trend: { month: string; revenue: number; orders: number; fieldShare: number }[];
  regions: RegionStat[];
  recentOrders: OverviewOrder[];
}

export interface AdminClientRow {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  productsLive: number;
  productsTotal: number;
  gmv: number;
  orders: number;
}

export interface AdminOfficerRow {
  id: string;
  name: string;
  email: string;
  city: string | null;
  region: string | null;
  joinedAt: string;
  salesMonth: number;
  unitsMonth: number;
  ordersMonth: number;
  commissionPending: number;
  lastSaleAt: string | null;
}

/* ---------------------------- client overview --------------------------- */

export interface ClientOverview {
  kpis: {
    revenueMonth: number;
    revenueGrowth: number;
    unitsMonth: number;
    unitsGrowth: number;
    liveProducts: number;
    totalProducts: number;
    pendingOrders: number;
  };
  trend: { label: string; value: number }[];
  topProducts: { name: string; revenue: number; units: number }[];
  recentOrders: OverviewOrder[];
  field: {
    revenue: number;
    units: number;
    officers: { rank: number; name: string; sales: number; units: number; orders: number }[];
    recentOrders: OverviewOrder[];
  };
}

/* ------------------------------ SWR wiring ------------------------------ */

export const ADMIN_OVERVIEW_KEY = "/api/admin/overview";
export const ADMIN_CLIENTS_KEY = "/api/admin/clients-overview";
export const ADMIN_OFFICERS_KEY = "/api/admin/officers-overview";
export const CLIENT_OVERVIEW_KEY = "/api/client/overview";

export const fetchAdminOverview = (url: string) => apiFetcher<AdminOverview>(url);
export const fetchAdminClients = (url: string) =>
  apiFetcher<{ clients: AdminClientRow[] }>(url);
export const fetchAdminOfficers = (url: string) =>
  apiFetcher<{ officers: AdminOfficerRow[]; regions: RegionStat[] }>(url);
export const fetchClientOverview = (url: string) => apiFetcher<ClientOverview>(url);
