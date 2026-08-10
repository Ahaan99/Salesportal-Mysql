"use client";

import { api } from "@/lib/api/client";

/* ===== LEADS ===== */
export type LeadPotential = "hot" | "warm" | "cold";
export type LeadStatus    = "new" | "contacted" | "interested" | "not_interested" | "converted" | "lost";

export type Lead = {
  id: string;
  officer_id: string;
  shop_name: string;
  owner_name: string;
  phone: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  potential: LeadPotential;
  status: LeadStatus;
  suggested_products: string[];
  last_contact_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadsResponse = { leads: Lead[]; total: number; page: number; page_size: number };

export type CreateLeadInput = {
  shop_name: string;
  owner_name: string;
  phone?: string;
  area?: string;
  city?: string;
  state?: string;
  potential?: LeadPotential;
  status?: LeadStatus;
  suggested_products?: string[];
  notes?: string;
};

export type UpdateLeadInput = Partial<CreateLeadInput & { last_contact_at: string }>;

/* ===== FOLLOW-UPS ===== */
export type FollowUpType   = "call" | "visit" | "whatsapp" | "email";
export type FollowUpStatus = "pending" | "done" | "missed" | "cancelled";

export type FollowUp = {
  id: string;
  lead_id: string;
  officer_id: string;
  type: FollowUpType;
  scheduled_at: string;
  completed_at: string | null;
  status: FollowUpStatus;
  notes: string | null;
  created_at: string;
};

export type CreateFollowUpInput = {
  type?: FollowUpType;
  scheduled_at: string;
  notes?: string;
};

export type UpdateFollowUpInput = {
  type?: FollowUpType;
  scheduled_at?: string;
  status?: FollowUpStatus;
  completed_at?: string;
  notes?: string;
};

/* ===== TASKS ===== */
export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus   = "pending" | "in_progress" | "done" | "cancelled";

export type CrmTask = {
  id: string;
  officer_id: string;
  lead_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  leads?: { shop_name: string; owner_name: string } | null;
};

export type TasksResponse = { tasks: CrmTask[]; total: number; page: number; page_size: number };

export type CreateTaskInput = {
  title: string;
  description?: string;
  due_date?: string;
  priority?: TaskPriority;
  lead_id?: string;
};

export type UpdateTaskInput = Partial<CreateTaskInput & { status: TaskStatus }>;

/* ===== MEETINGS ===== */
export type MeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export type Meeting = {
  id: string;
  officer_id: string;
  lead_id: string | null;
  title: string;
  customer_name: string | null;
  location: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: MeetingStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  leads?: { shop_name: string; owner_name: string } | null;
};

export type MeetingsResponse = { meetings: Meeting[]; total: number; page: number; page_size: number };

export type CreateMeetingInput = {
  title: string;
  scheduled_at: string;
  customer_name?: string;
  location?: string;
  duration_minutes?: number;
  lead_id?: string;
  notes?: string;
};

export type UpdateMeetingInput = Partial<CreateMeetingInput & { status: MeetingStatus }>;

/* ===== NOTES ===== */
export type LeadNote = {
  id: string;
  lead_id: string;
  officer_id: string;
  content: string;
  created_at: string;
};

/* ===== API FUNCTIONS ===== */

// Leads
export const listLeads = (opts: { status?: LeadStatus; potential?: LeadPotential; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status)    p.set("status", opts.status);
  if (opts.potential) p.set("potential", opts.potential);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return api<LeadsResponse>(`/api/field/crm/leads${qs ? `?${qs}` : ""}`);
};

export const createLead = (input: CreateLeadInput) =>
  api<{ lead: Lead }>("/api/field/crm/leads", { method: "POST", body: input });

export const getLead = (id: string) =>
  api<{ lead: Lead & { lead_follow_ups: FollowUp[]; lead_notes: LeadNote[] } }>(`/api/field/crm/leads/${id}`);

export const updateLead = (id: string, input: UpdateLeadInput) =>
  api<{ lead: Lead }>(`/api/field/crm/leads/${id}`, { method: "PATCH", body: input });

export const deleteLead = (id: string) =>
  api<{ ok: boolean }>(`/api/field/crm/leads/${id}`, { method: "DELETE" });

// Follow-ups
export const listFollowUps = (leadId: string) =>
  api<{ follow_ups: FollowUp[] }>(`/api/field/crm/leads/${leadId}/follow-ups`);

export const createFollowUp = (leadId: string, input: CreateFollowUpInput) =>
  api<{ follow_up: FollowUp }>(`/api/field/crm/leads/${leadId}/follow-ups`, { method: "POST", body: input });

export const updateFollowUp = (id: string, input: UpdateFollowUpInput) =>
  api<{ follow_up: FollowUp }>(`/api/field/crm/follow-ups/${id}`, { method: "PATCH", body: input });

export const deleteFollowUp = (id: string) =>
  api<{ ok: boolean }>(`/api/field/crm/follow-ups/${id}`, { method: "DELETE" });

// Tasks
export const listTasks = (opts: { status?: TaskStatus; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status) p.set("status", opts.status);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return api<TasksResponse>(`/api/field/crm/tasks${qs ? `?${qs}` : ""}`);
};

export const createTask = (input: CreateTaskInput) =>
  api<{ task: CrmTask }>("/api/field/crm/tasks", { method: "POST", body: input });

export const updateTask = (id: string, input: UpdateTaskInput) =>
  api<{ task: CrmTask }>(`/api/field/crm/tasks/${id}`, { method: "PATCH", body: input });

export const deleteTask = (id: string) =>
  api<{ ok: boolean }>(`/api/field/crm/tasks/${id}`, { method: "DELETE" });

// Meetings
export const listMeetings = (opts: { status?: MeetingStatus; upcoming?: boolean; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status)   p.set("status", opts.status);
  if (opts.upcoming) p.set("upcoming", "1");
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return api<MeetingsResponse>(`/api/field/crm/meetings${qs ? `?${qs}` : ""}`);
};

export const createMeeting = (input: CreateMeetingInput) =>
  api<{ meeting: Meeting }>("/api/field/crm/meetings", { method: "POST", body: input });

export const updateMeeting = (id: string, input: UpdateMeetingInput) =>
  api<{ meeting: Meeting }>(`/api/field/crm/meetings/${id}`, { method: "PATCH", body: input });

export const deleteMeeting = (id: string) =>
  api<{ ok: boolean }>(`/api/field/crm/meetings/${id}`, { method: "DELETE" });

// Notes
export const listNotes = (leadId: string) =>
  api<{ notes: LeadNote[] }>(`/api/field/crm/leads/${leadId}/notes`);

export const createNote = (leadId: string, content: string) =>
  api<{ note: LeadNote }>(`/api/field/crm/leads/${leadId}/notes`, { method: "POST", body: { content } });

export const deleteNote = (id: string) =>
  api<{ ok: boolean }>(`/api/field/crm/notes/${id}`, { method: "DELETE" });

/* ===== SWR KEYS ===== */
export const leadsKey = (opts: { status?: LeadStatus; potential?: LeadPotential; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status)    p.set("status", opts.status);
  if (opts.potential) p.set("potential", opts.potential);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/field/crm/leads${qs ? `?${qs}` : ""}`;
};

export const tasksKey = (opts: { status?: TaskStatus; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status) p.set("status", opts.status);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/field/crm/tasks${qs ? `?${qs}` : ""}`;
};

export const meetingsKey = (opts: { status?: MeetingStatus; upcoming?: boolean; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.status)   p.set("status", opts.status);
  if (opts.upcoming) p.set("upcoming", "1");
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const qs = p.toString();
  return `/api/field/crm/meetings${qs ? `?${qs}` : ""}`;
};

/* ===== LABEL MAPS ===== */
export const POTENTIAL_LABELS: Record<LeadPotential, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };
export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New", contacted: "Contacted", interested: "Interested",
  not_interested: "Not Interested", converted: "Converted", lost: "Lost",
};
export const FOLLOWUP_TYPE_LABELS: Record<FollowUpType, string> = {
  call: "Call", visit: "Visit", whatsapp: "WhatsApp", email: "Email",
};
export const FOLLOWUP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: "Pending", done: "Done", missed: "Missed", cancelled: "Cancelled",
};
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { high: "High", medium: "Medium", low: "Low" };
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending", in_progress: "In Progress", done: "Done", cancelled: "Cancelled",
};
export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled", no_show: "No Show",
};
