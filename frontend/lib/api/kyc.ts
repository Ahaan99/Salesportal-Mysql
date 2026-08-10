import { api, apiFetcher } from "@/lib/api/client";

    // ─── Types ───────────────────────────────────────────────────────────────────

    export type DocType =
    | "pan" | "driving_license" | "passport" | "voter_id"
    | "gst" | "bank_statement" | "shop_photo";

    export const DOC_TYPE_LABELS: Record<DocType, string> = {
    pan:             "PAN Card",
    driving_license: "Driving Licence",
    passport:        "Passport",
    voter_id:        "Voter ID",
    gst:             "GST Certificate",
    bank_statement:  "Bank Statement",
    shop_photo:      "Shop / Business Photo",
    };

    export const ALL_DOC_TYPES: DocType[] = [
    "pan","driving_license","passport","voter_id","gst","bank_statement","shop_photo",
    ];

    export type KycStatus = "draft" | "pending" | "approved" | "rejected";

    export interface KycSubmission {
    id: string; user_id: string; user_role: "field" | "client"; status: KycStatus;
    submitted_at: string | null; reviewed_at: string | null; reviewed_by: string | null;
    rejection_reason: string | null; created_at: string; updated_at: string;
    }
    export interface KycDocument {
    id: string; submission_id: string; user_id: string; doc_type: DocType;
    file_name: string; file_size: number; mime_type: string; uploaded_at: string;
    }
    export interface MyKycResponse { submission: KycSubmission; documents: KycDocument[]; }

    export interface AdminKycItem {
    id: string; user_id: string; user_role: "field" | "client"; status: KycStatus;
    submitted_at: string | null; reviewed_at: string | null; rejection_reason: string | null;
    profile: { full_name: string | null; phone: string | null; city: string | null; state: string | null } | null;
    doc_count: number;
    }
    export interface AdminKycListResponse { submissions: AdminKycItem[]; total: number; page: number; pageSize: number; }
    export interface AdminKycDetailResponse {
    submission: KycSubmission; documents: KycDocument[];
    profile: { full_name: string | null; phone: string | null; city: string | null; state: string | null } | null;
    }

    // ─── SWR Keys ────────────────────────────────────────────────────────────────
    export const FIELD_KYC_KEY  = "/api/field/kyc/me";
    export const CLIENT_KYC_KEY = "/api/client/kyc/me";
    export function adminKycKey(status: string, page: number, role?: string) {
    const p = new URLSearchParams({ status, page: String(page) });
    if (role) p.set("role", role);
    return `/api/admin/kyc?${p.toString()}`;
    }
    export const adminKycDetailKey = (id: string) => `/api/admin/kyc/${id}`;

    // ─── FSO API calls ────────────────────────────────────────────────────────────
    export const fetchMyKyc = (url: string): Promise<MyKycResponse> => apiFetcher<MyKycResponse>(url);

    async function _uploadDoc(apiBase: string, docType: DocType, file: File) {
    // Auth rides on the HttpOnly rw_session cookie (same-origin /backend
    // rewrite) — no client-side token handling needed for uploads either.
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "/backend").replace(/\/+$/, "");
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    const resp = await fetch(`${base}${apiBase}`, {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({ error: resp.statusText })); throw new Error(e.error ?? "Upload failed"); }
    return resp.json() as Promise<{ document: KycDocument }>;
    }

    export const uploadFieldDocument  = (docType: DocType, file: File) => _uploadDoc("/api/field/kyc/documents", docType, file);
    export const uploadClientDocument = (docType: DocType, file: File) => _uploadDoc("/api/client/kyc/documents", docType, file);

    export const deleteFieldDocument  = (id: string) => api<{ ok: boolean }>(`/api/field/kyc/documents/${id}`, { method: "DELETE" });
    export const deleteClientDocument = (id: string) => api<{ ok: boolean }>(`/api/client/kyc/documents/${id}`, { method: "DELETE" });
    export const submitFieldKyc       = () => api<{ submission: KycSubmission }>("/api/field/kyc/submit", { method: "PATCH" });
    export const submitClientKyc      = () => api<{ submission: KycSubmission }>("/api/client/kyc/submit", { method: "PATCH" });

    // ─── Admin API calls ──────────────────────────────────────────────────────────
    export const fetchAdminKyc       = (url: string): Promise<AdminKycListResponse> => apiFetcher<AdminKycListResponse>(url);
    export const fetchAdminKycDetail = (url: string): Promise<AdminKycDetailResponse> => apiFetcher<AdminKycDetailResponse>(url);
    export function adminReviewKyc(id: string, action: "approve" | "reject", rejectionReason?: string) {
    return api<{ submission: KycSubmission }>(`/api/admin/kyc/${id}/review`, {
      method: "PATCH", body: { action, rejection_reason: rejectionReason },
    });
    }
    