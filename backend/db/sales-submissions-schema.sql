-- ============================================================
-- Sales Submissions — FSO → Admin verification queue
-- Applied after portal-schema.sql (touch_updated_at must exist)
-- Safe to re-run: uses IF NOT EXISTS / idempotent guards.
-- ============================================================

create table if not exists public.sales_submissions (
  id                  uuid primary key default gen_random_uuid(),
  officer_id          uuid not null references auth.users(id) on delete cascade,
  officer_name        text not null check (char_length(officer_name) between 1 and 120),
  product_id          uuid references public.products(id) on delete set null,
  product_name        text not null check (char_length(product_name) between 1 and 200),
  customer_name       text not null check (char_length(customer_name) between 1 and 160),
  customer_company    text check (char_length(customer_company) <= 160),
  customer_phone      text,
  city                text check (char_length(city) <= 100),
  state               text check (char_length(state) <= 100),
  qty                 int not null check (qty > 0),
  unit_price          numeric(12,2) not null check (unit_price > 0),
  total_amount        numeric(14,2) not null check (total_amount > 0),
  commission_rate     numeric(5,4) not null default 0.08
                        check (commission_rate > 0 and commission_rate < 1),
  invoice_ref         text check (char_length(invoice_ref) <= 200),
  payment_mode        text
                        check (payment_mode in ('cash','upi','bank_transfer','cheque','other')),
  payment_ref         text check (char_length(payment_ref) <= 200),
  remarks             text check (char_length(remarks) <= 1000),
  status              text not null default 'pending'
                        check (status in ('pending','approved','rejected','hold','clarification')),
  admin_note          text check (char_length(admin_note) <= 1000),
  reviewed_by         uuid references auth.users(id) on delete set null,
  reviewed_at         timestamptz,
  -- Populated on approve: references the created order row
  order_id            uuid references public.orders(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Index: officer's own submissions (most recent first)
create index if not exists idx_sales_sub_officer
  on public.sales_submissions(officer_id, created_at desc);

-- Index: admin moderation queue (oldest pending first — fairness)
create index if not exists idx_sales_sub_status
  on public.sales_submissions(status, created_at asc);

-- Index: product linkage
create index if not exists idx_sales_sub_product
  on public.sales_submissions(product_id);

-- Auto-update updated_at (reuses the function created by portal-schema.sql)
drop trigger if exists trg_sales_sub_touch on public.sales_submissions;
create trigger trg_sales_sub_touch
  before update on public.sales_submissions
  for each row execute function public.touch_updated_at();
