import { apiFetcher } from "@/lib/api/client";

    export interface AdminSummary {
    gmv: number;
    salesGmv: number;
    totalOrders: number;
    kycCounts: { draft: number; pending: number; approved: number; rejected: number };
    }

    export interface SalesTrendPoint { date: string; value: number; }
    export interface SalesTrend { trend: SalesTrendPoint[]; }

    export interface TopOfficer {
    id: string; name: string; city: string; sales: number; orders: number;
    }
    export interface TopOfficersResponse { officers: TopOfficer[]; }

    export interface KycStats {
    byStatus: { draft: number; pending: number; approved: number; rejected: number };
    byRole:   { field: number; client: number };
    total: number;
    recentPending: number;
    }

    export interface CommissionSummaryResponse { summary: Record<string, number>; }

    export interface FieldReports {
    trend: SalesTrendPoint[];
    totalSales: number;
    pendingSales: number;
    totalEarnings: number;
    pendingEarnings: number;
    rank: number | null;
    totalOfficers: number;
    salesCount: number;
    }

    // SWR keys
    export const ADMIN_SUMMARY_KEY     = "/api/admin/reports/summary";
    export const ADMIN_SALES_TREND_KEY = (days: number) => `/api/admin/reports/sales-trend?days=${days}`;
    export const ADMIN_TOP_OFFICERS_KEY = "/api/admin/reports/top-officers";
    export const ADMIN_KYC_STATS_KEY   = "/api/admin/reports/kyc-stats";
    export const ADMIN_COMMISSION_SUMMARY_KEY = "/api/admin/reports/commission-summary";
    export const FIELD_REPORTS_KEY     = (days: number) => `/api/field/reports?days=${days}`;

    export const fetchAdminSummary            = (url: string) => apiFetcher<AdminSummary>(url);
    export const fetchAdminSalesTrend         = (url: string) => apiFetcher<SalesTrend>(url);
    export const fetchAdminTopOfficers        = (url: string) => apiFetcher<TopOfficersResponse>(url);
    export const fetchAdminKycStats           = (url: string) => apiFetcher<KycStats>(url);
    export const fetchAdminCommissionSummary  = (url: string) => apiFetcher<CommissionSummaryResponse>(url);
    export const fetchFieldReports            = (url: string) => apiFetcher<FieldReports>(url);
    