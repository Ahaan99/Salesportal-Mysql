-- crm-schema.sql
-- CRM Module: leads, lead_follow_ups, crm_tasks, meetings, lead_notes
-- Scoped to field officers. Run in Supabase SQL editor (or psql).
-- Depends on: portal-schema.sql (touch_updated_at must exist).
-- Safe to re-run: drops and recreates all CRM tables cleanly.

-- ---------------------------------------------------------------
-- TEARDOWN — drop in reverse FK order so re-runs always start fresh
-- ---------------------------------------------------------------
drop table if exists public.lead_notes      cascade;
drop table if exists public.lead_follow_ups cascade;
drop table if exists public.crm_tasks       cascade;
drop table if exists public.meetings        cascade;
drop table if exists public.leads           cascade;

-- ---------------------------------------------------------------
-- LEADS — prospect shops tracked by field officers
-- ---------------------------------------------------------------
create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  officer_id      uuid not null references auth.users(id) on delete cascade,
  shop_name       text not null check (char_length(shop_name) between 1 and 200),
  owner_name      text not null check (char_length(owner_name) between 1 and 160),
  phone           text,
  area            text check (char_length(area) <= 200),
  city            text check (char_length(city) <= 100),
  state           text check (char_length(state) <= 100),
  potential       text not null default 'warm'
                    check (potential in ('hot','warm','cold')),
  status          text not null default 'new'
                    check (status in ('new','contacted','interested','not_interested','converted','lost')),
  suggested_products text[] not null default '{}',
  last_contact_at timestamptz,
  notes           text check (char_length(notes) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_leads_officer   on public.leads(officer_id, created_at desc);
create index idx_leads_status    on public.leads(status);
create index idx_leads_potential on public.leads(potential);

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch
  before update on public.leads
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- LEAD FOLLOW-UPS — scheduled follow-up actions on leads
-- ---------------------------------------------------------------
create table public.lead_follow_ups (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  officer_id   uuid not null references auth.users(id) on delete cascade,
  type         text not null default 'call'
                 check (type in ('call','visit','whatsapp','email')),
  scheduled_at timestamptz not null,
  completed_at timestamptz,
  status       text not null default 'pending'
                 check (status in ('pending','done','missed','cancelled')),
  notes        text check (char_length(notes) <= 1000),
  created_at   timestamptz not null default now()
);

create index idx_follow_ups_lead    on public.lead_follow_ups(lead_id, scheduled_at asc);
create index idx_follow_ups_officer on public.lead_follow_ups(officer_id, scheduled_at asc);
create index idx_follow_ups_status  on public.lead_follow_ups(status, scheduled_at asc);

-- ---------------------------------------------------------------
-- CRM TASKS — to-do items for field officers
-- ---------------------------------------------------------------
create table public.crm_tasks (
  id          uuid primary key default gen_random_uuid(),
  officer_id  uuid not null references auth.users(id) on delete cascade,
  lead_id     uuid references public.leads(id) on delete set null,
  title       text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 1000),
  due_date    date,
  priority    text not null default 'medium'
                check (priority in ('high','medium','low')),
  status      text not null default 'pending'
                check (status in ('pending','in_progress','done','cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_crm_tasks_officer on public.crm_tasks(officer_id, due_date asc);
create index idx_crm_tasks_lead    on public.crm_tasks(lead_id);
create index idx_crm_tasks_status  on public.crm_tasks(status);

drop trigger if exists trg_crm_tasks_touch on public.crm_tasks;
create trigger trg_crm_tasks_touch
  before update on public.crm_tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- MEETINGS — scheduled meetings with customers/leads
-- ---------------------------------------------------------------
create table public.meetings (
  id               uuid primary key default gen_random_uuid(),
  officer_id       uuid not null references auth.users(id) on delete cascade,
  lead_id          uuid references public.leads(id) on delete set null,
  title            text not null check (char_length(title) between 1 and 300),
  customer_name    text check (char_length(customer_name) <= 160),
  location         text check (char_length(location) <= 300),
  scheduled_at     timestamptz not null,
  duration_minutes int not null default 30 check (duration_minutes between 5 and 480),
  status           text not null default 'scheduled'
                     check (status in ('scheduled','completed','cancelled','no_show')),
  notes            text check (char_length(notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_meetings_officer on public.meetings(officer_id, scheduled_at asc);
create index idx_meetings_lead    on public.meetings(lead_id);
create index idx_meetings_status  on public.meetings(status);

drop trigger if exists trg_meetings_touch on public.meetings;
create trigger trg_meetings_touch
  before update on public.meetings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- LEAD NOTES — notes attached to leads
-- ---------------------------------------------------------------
create table public.lead_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  officer_id uuid not null references auth.users(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index idx_lead_notes_lead    on public.lead_notes(lead_id, created_at desc);
create index idx_lead_notes_officer on public.lead_notes(officer_id);

-- ---------------------------------------------------------------
-- RLS — deny-all posture; all access via Express service-role key
-- ---------------------------------------------------------------
alter table public.leads           enable row level security;
alter table public.lead_follow_ups enable row level security;
alter table public.crm_tasks       enable row level security;
alter table public.meetings        enable row level security;
alter table public.lead_notes      enable row level security;
