-- commission-wallet-schema.sql
-- Run in Supabase SQL editor (or psql). Safe to re-run.
-- Adds: officer_wallets, payout_requests tables
-- Depends on: profiles, commissions (already created by portal-schema.sql)

-- ---------------------------------------------------------------
-- officer_wallets
-- One row per field officer. Tracks pending, available, withdrawn.
-- Updated by trigger whenever a commission status changes.
-- ---------------------------------------------------------------
create table if not exists public.officer_wallets (
  officer_id        uuid primary key references auth.users(id) on delete cascade,
  pending_amount    numeric(14,2) not null default 0 check (pending_amount >= 0),
  available_amount  numeric(14,2) not null default 0 check (available_amount >= 0),
  withdrawn_amount  numeric(14,2) not null default 0 check (withdrawn_amount >= 0),
  total_earned      numeric(14,2) not null default 0 check (total_earned >= 0),
  updated_at        timestamptz not null default now()
);

comment on table public.officer_wallets is
  'Running wallet balance for each FSO. Kept in sync by sync_wallet_on_commission trigger.';

drop trigger if exists trg_officer_wallets_touch on public.officer_wallets;
create trigger trg_officer_wallets_touch
  before update on public.officer_wallets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- payout_requests
-- FSO requests a payout; admin reviews and marks settled/rejected.
-- ---------------------------------------------------------------
create table if not exists public.payout_requests (
  id              uuid primary key default gen_random_uuid(),
  officer_id      uuid not null references auth.users(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  bank_name       text,
  bank_account    text,
  bank_ifsc       text,
  upi_id          text,
  remarks         text check (char_length(remarks) <= 500),
  status          text not null default 'pending'
                    check (status in ('pending','processing','paid','rejected')),
  admin_note      text check (char_length(admin_note) <= 500),
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  paid_at         timestamptz,
  transaction_ref text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_payout_requests_officer   on public.payout_requests(officer_id, created_at desc);
create index if not exists idx_payout_requests_status    on public.payout_requests(status, created_at desc);

drop trigger if exists trg_payout_requests_touch on public.payout_requests;
create trigger trg_payout_requests_touch
  before update on public.payout_requests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- Function: sync_wallet_on_commission
-- Keeps officer_wallets in sync when a commission row is
-- inserted or its status changes (pending → settled).
-- ---------------------------------------------------------------
create or replace function public.sync_wallet_on_commission()
returns trigger language plpgsql security definer as $$
begin
  -- Upsert the wallet row for this officer so it always exists.
  insert into public.officer_wallets(officer_id)
  values (NEW.officer_id)
  on conflict (officer_id) do nothing;

  -- Recalculate all three buckets from the commissions table directly
  -- (simpler than delta-tracking and idempotent on re-runs).
  update public.officer_wallets w
  set
    pending_amount   = coalesce((
      select sum(c.amount) from public.commissions c
       where c.officer_id = NEW.officer_id and c.status = 'pending'
    ), 0),
    available_amount = coalesce((
      select sum(c.amount) from public.commissions c
       where c.officer_id = NEW.officer_id and c.status = 'available'
    ), 0),
    withdrawn_amount = coalesce((
      select sum(c.amount) from public.commissions c
       where c.officer_id = NEW.officer_id and c.status = 'settled'
    ), 0),
    total_earned     = coalesce((
      select sum(c.amount) from public.commissions c
       where c.officer_id = NEW.officer_id
         and c.status in ('pending','available','settled')
    ), 0)
  where w.officer_id = NEW.officer_id;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_wallet_on_commission on public.commissions;
create trigger trg_sync_wallet_on_commission
  after insert or update of status on public.commissions
  for each row execute function public.sync_wallet_on_commission();

-- ---------------------------------------------------------------
-- Add 'available' to commissions status enum (if not present)
-- The commission flow: pending (admin approved) → available
-- (X days hold / manual release) → settled (payout paid)
-- ---------------------------------------------------------------
-- Check if 'available' is already in the check constraint;
-- if not, drop and recreate it.
do $$
begin
  -- Drop old constraint if it doesn't include 'available'
  if exists (
    select 1 from information_schema.check_constraints
    where constraint_name like '%commissions%status%'
      and check_clause not like '%available%'
  ) then
    alter table public.commissions
      drop constraint if exists commissions_status_check;
  end if;
end;
$$;

-- Re-add with the full set (idempotent: ADD CONSTRAINT IF NOT EXISTS)
alter table public.commissions
  drop constraint if exists commissions_status_check;
alter table public.commissions
  add constraint commissions_status_check
  check (status in ('pending','available','settled'));
