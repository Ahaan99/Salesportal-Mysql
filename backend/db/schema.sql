-- ============================================================
-- Recruweb Sales Portal — Catalog & Orders schema
-- Applied by: backend/db/seed.js  (node db/seed.js)
-- Safe to re-run: uses IF NOT EXISTS / idempotent guards.
-- ============================================================

create extension if not exists pg_trgm;

-- ---------- Categories (3-level tree: department > category > subcategory)
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text not null,
  slug        text not null unique,
  parent_id   bigint references public.categories(id) on delete cascade,
  level       smallint not null default 0 check (level between 0 and 2),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_categories_parent on public.categories(parent_id);
create index if not exists idx_categories_level on public.categories(level);

-- ---------- Products
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  category_id   bigint references public.categories(id) on delete set null,
  name          text not null check (char_length(name) between 3 and 180),
  slug          text not null,
  brand         text,
  description   text check (char_length(description) <= 5000),
  price         numeric(12,2) not null check (price > 0),
  mrp           numeric(12,2) check (mrp is null or mrp >= price),
  stock         int not null default 0 check (stock >= 0),
  sku           text not null unique,
  status        text not null default 'review'
                check (status in ('draft','review','live','rejected','archived')),
  images        text[] not null default '{}',
  rating        numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_products_owner on public.products(owner_id);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_name_trgm on public.products using gin (name gin_trgm_ops);

-- ---------- Orders
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_no       text not null unique,
  client_id      uuid not null references auth.users(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  product_name   text not null,             -- snapshot: survives product deletion
  customer_name  text not null,
  city           text not null,
  state          text,
  channel        text not null default 'online' check (channel in ('online','field')),
  officer_name   text,                      -- set when channel = 'field'
  qty            int not null check (qty > 0 and qty <= 10000),
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  amount         numeric(12,2) not null check (amount >= 0),
  status         text not null default 'processing'
                 check (status in ('processing','packed','in-transit','delivered','returned','cancelled')),
  placed_at      timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_orders_client on public.orders(client_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_channel on public.orders(channel);
create index if not exists idx_orders_placed_at on public.orders(placed_at desc);
create index if not exists idx_orders_search_trgm on public.orders
  using gin ((coalesce(order_no,'') || ' ' || coalesce(product_name,'') || ' ' ||
              coalesce(customer_name,'') || ' ' || coalesce(city,'')) gin_trgm_ops);

-- ---------- updated_at trigger for products
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security
-- All access goes through the Express backend using the service-role key
-- (which bypasses RLS). Enabling RLS with NO policies = deny-all for the
-- anon/publishable key, so the tables can never be read or written
-- directly from a browser.
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.orders     enable row level security;

-- Categories are harmless, read-only reference data: allow public reads
-- so dropdowns could work even without the backend if ever needed.
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select using (true);

-- ---------- Returns (customer-initiated return requests)
create table if not exists public.returns (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  client_id     uuid not null references auth.users(id) on delete cascade,
  reason        text not null check (char_length(reason) between 5 and 500),
  reason_code   text not null check (reason_code in ('defective','not-as-described','changed-mind','damaged','other')),
  return_qty    int not null check (return_qty > 0 and return_qty <= 10000),
  refund_amount numeric(12,2) not null check (refund_amount > 0),
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','shipped','completed')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_returns_order on public.returns(order_id);
create index if not exists idx_returns_client on public.returns(client_id);
create index if not exists idx_returns_status on public.returns(status);
create index if not exists idx_returns_created_at on public.returns(created_at desc);

-- ---------- Refunds (payment refund processing)
create table if not exists public.refunds (
  id            uuid primary key default gen_random_uuid(),
  return_id     uuid not null references public.returns(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  client_id     uuid not null references auth.users(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  refund_method text not null default 'original-payment'
                check (refund_method in ('original-payment','wallet','bank-transfer')),
  status        text not null default 'pending'
                check (status in ('pending','processing','completed','failed')),
  failure_reason text,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_refunds_return on public.refunds(return_id);
create index if not exists idx_refunds_order on public.refunds(order_id);
create index if not exists idx_refunds_client on public.refunds(client_id);
create index if not exists idx_refunds_status on public.refunds(status);
create index if not exists idx_refunds_created_at on public.refunds(created_at desc);

-- Trigger to update returns.updated_at
drop trigger if exists trg_returns_touch on public.returns;
create trigger trg_returns_touch
  before update on public.returns
  for each row execute function public.touch_updated_at();

-- Trigger to update refunds.updated_at
drop trigger if exists trg_refunds_touch on public.refunds;
create trigger trg_refunds_touch
  before update on public.refunds
  for each row execute function public.touch_updated_at();

-- RLS: same deny-all posture as the other tables — all access goes
-- through the Express backend with the service-role key. No policies
-- means the anon/publishable key can never touch these rows directly.
alter table public.returns enable row level security;
alter table public.refunds enable row level security;

-- ---------- Aggregate summary used by the orders dashboard header
create or replace function public.orders_summary(p_client_id uuid)
returns json language sql stable as $$
  select json_build_object(
    'total_amount', coalesce(sum(amount) filter (where status not in ('cancelled','returned')), 0),
    'total_orders', count(*),
    'field_share',  case when count(*) = 0 then 0
                    else round(100.0 * count(*) filter (where channel = 'field') / count(*)) end,
    'delivered',    count(*) filter (where status = 'delivered'),
    'in_transit',   count(*) filter (where status in ('in-transit','packed','processing')),
    'returned',     count(*) filter (where status in ('returned','cancelled'))
  )
  from public.orders
  where client_id = p_client_id;
$$;
