-- ============================================================
-- Recruweb Sales Portal — Support Chat schema
-- Applied by: backend/db/migrate-chat.js  (node db/migrate-chat.js)
-- Safe to re-run: uses IF NOT EXISTS / idempotent guards, and
-- upgrades a legacy chat_threads/chat_messages shape in place
-- (column renames — no data loss).
-- ============================================================

-- ---------- Legacy-shape upgrade (earlier prototype used user_* columns)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_threads' and column_name = 'user_id'
  ) then
    alter table public.chat_threads rename column user_id to participant_id;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_threads' and column_name = 'user_name'
  ) then
    alter table public.chat_threads rename column user_name to participant_name;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_threads' and column_name = 'user_role'
  ) then
    alter table public.chat_threads rename column user_role to participant_role;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_threads' and column_name = 'admin_unread'
  ) then
    alter table public.chat_threads rename column admin_unread to unread_for_admin;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_threads' and column_name = 'user_unread'
  ) then
    alter table public.chat_threads rename column user_unread to unread_for_participant;
  end if;
end $$;

-- ---------- Chat threads
-- One support thread per participant (vendor client or field officer).
-- Admin/HQ replies into these threads from the admin inbox.
create table if not exists public.chat_threads (
  id                      uuid primary key default gen_random_uuid(),
  participant_id          uuid not null unique references auth.users(id) on delete cascade,
  participant_name        text not null check (char_length(participant_name) between 1 and 120),
  participant_role        text not null check (participant_role in ('client','field')),
  last_message            text,
  last_message_at         timestamptz,
  unread_for_admin        int not null default 0 check (unread_for_admin >= 0),
  unread_for_participant  int not null default 0 check (unread_for_participant >= 0),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Columns/constraints the legacy table may be missing
alter table public.chat_threads
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chat_threads'::regclass
      and contype = 'u'
      and conname = 'chat_threads_participant_id_key'
  ) then
    alter table public.chat_threads
      add constraint chat_threads_participant_id_key unique (participant_id);
  end if;
end $$;

create index if not exists idx_chat_threads_participant on public.chat_threads(participant_id);
create index if not exists idx_chat_threads_role on public.chat_threads(participant_role);
create index if not exists idx_chat_threads_last_message_at on public.chat_threads(last_message_at desc nulls last);

-- ---------- Chat messages
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.chat_threads(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('participant','admin')),
  body        text not null check (char_length(body) between 1 and 2000),
  status      text not null default 'sent' check (status in ('sent','delivered','read')),
  created_at  timestamptz not null default now()
);

-- Legacy table may be missing the delivery-status column
alter table public.chat_messages
  add column if not exists status text not null default 'sent';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chat_messages'::regclass and conname = 'chat_messages_status_check'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_status_check check (status in ('sent','delivered','read'));
  end if;
end $$;

-- Legacy prototype used sender_role in ('user','support') — upgrade the
-- data first, then swap the check constraint to ('participant','admin').
-- Without this, every participant/admin send fails the check and 500s.
do $$
begin
  update public.chat_messages set sender_role = 'participant' where sender_role = 'user';
  update public.chat_messages set sender_role = 'admin' where sender_role = 'support';
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.chat_messages'::regclass
      and conname = 'chat_messages_sender_role_check'
      and pg_get_constraintdef(oid) not like '%participant%'
  ) then
    alter table public.chat_messages drop constraint chat_messages_sender_role_check;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chat_messages'::regclass
      and conname = 'chat_messages_sender_role_check'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_sender_role_check
      check (sender_role in ('participant','admin'));
  end if;
end $$;

create index if not exists idx_chat_messages_thread on public.chat_messages(thread_id, created_at);
create index if not exists idx_chat_messages_status on public.chat_messages(thread_id, sender_role, status);

-- ---------- updated_at trigger (shared with the rest of the schema)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_chat_threads_touch on public.chat_threads;
create trigger trg_chat_threads_touch
  before update on public.chat_threads
  for each row execute function public.touch_updated_at();

-- ---------- Atomic thread bump
-- Sets the thread preview and increments exactly one unread counter in a
-- single UPDATE, so two concurrent sends can never lose an increment the
-- way a read-modify-write from the application would.
create or replace function public.chat_bump_thread(
  p_thread_id        uuid,
  p_last_message     text,
  p_last_message_at  timestamptz,
  p_bump_admin       boolean,
  p_participant_name text default null
) returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_threads
     set last_message           = p_last_message,
         last_message_at        = p_last_message_at,
         unread_for_admin       = unread_for_admin       + case when p_bump_admin then 1 else 0 end,
         unread_for_participant = unread_for_participant + case when p_bump_admin then 0 else 1 end,
         participant_name       = coalesce(nullif(trim(p_participant_name), ''), participant_name)
   where id = p_thread_id;
$$;

-- Only the service-role backend may call this — never browser keys.
revoke execute on function public.chat_bump_thread(uuid, text, timestamptz, boolean, text)
  from public, anon, authenticated;

-- ---------- Row Level Security
-- Same deny-all posture as the rest of the schema: all access goes through
-- the Express backend using the service-role key (bypasses RLS). No
-- policies = the anon/publishable key can never touch these rows directly.
alter table public.chat_threads  enable row level security;
alter table public.chat_messages enable row level security;
