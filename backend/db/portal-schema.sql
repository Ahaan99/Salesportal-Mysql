-- ============================================================
-- Recruweb Sales Portal — Field Officer + Admin portal schema
-- Applied by: backend/db/migrate-portal.js  (node db/migrate-portal.js)
-- Safe to re-run: uses IF NOT EXISTS / idempotent guards.
--
-- Adds: profiles, commissions, notifications, leads, visits,
--       orders.officer_id / customer_phone, and the RPCs backing
--       the field & admin dashboards.
-- ============================================================

-- ---------- Profiles (one per auth user; primarily field officers)
create table if not exists public.profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  full_name      text not null check (char_length(full_name) between 1 and 120),
  phone          text,
  city           text,
  state          text,
  region         text check (region in ('North','South','East','West')),
  address        text check (char_length(address) <= 500),
  photo_url      text,
  bank_name      text,
  bank_account   text,
  bank_ifsc      text,
  monthly_target numeric(12,2) not null default 350000 check (monthly_target >= 0),
  joined_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_profiles_region on public.profiles(region);
create index if not exists idx_profiles_city on public.profiles(city);

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- Orders: real officer linkage + customer phone
alter table public.orders
  add column if not exists officer_id uuid references auth.users(id) on delete set null;
alter table public.orders
  add column if not exists customer_phone text;

create index if not exists idx_orders_officer on public.orders(officer_id, placed_at desc);

-- ---------- Commissions (flat rate per field-channel order row)
create table if not exists public.commissions (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.orders(id) on delete cascade,
  officer_id  uuid not null references auth.users(id) on delete cascade,
  rate        numeric(5,4) not null default 0.08 check (rate > 0 and rate < 1),
  amount      numeric(12,2) not null check (amount >= 0),
  status      text not null default 'pending' check (status in ('pending','settled')),
  settled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_commissions_officer
  on public.commissions(officer_id, status, created_at desc);

-- ---------- Notifications
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in ('order','commission','product','return','lead','application','system')),
  title      text not null check (char_length(title) between 1 and 160),
  body       text check (char_length(body) <= 500),
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user
  on public.notifications(user_id, read, created_at desc);

-- ---------- Leads (retail shops for field officers to visit)
create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  shop_name           text not null check (char_length(shop_name) between 1 and 160),
  owner_name          text,
  phone               text,
  area                text,
  city                text not null,
  state               text,
  potential           text not null default 'warm' check (potential in ('hot','warm','cold')),
  assigned_officer_id uuid references auth.users(id) on delete set null,
  last_visit_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_leads_officer on public.leads(assigned_officer_id);
create index if not exists idx_leads_city on public.leads(city);

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch
  before update on public.leads
  for each row execute function public.touch_updated_at();

-- ---------- Visits (an officer's logged visit to a lead)
create table if not exists public.visits (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid references public.leads(id) on delete set null,
  officer_id uuid not null references auth.users(id) on delete cascade,
  outcome    text not null check (outcome in ('ordered','interested','follow-up','not-interested')),
  note       text check (char_length(note) <= 500),
  visited_at timestamptz not null default now()
);

create index if not exists idx_visits_officer_day on public.visits(officer_id, visited_at desc);
create index if not exists idx_visits_lead on public.visits(lead_id);

-- ---------- Row Level Security (deny-all: service-role backend only)
alter table public.profiles      enable row level security;
alter table public.commissions   enable row level security;
alter table public.notifications enable row level security;
alter table public.leads         enable row level security;
alter table public.visits        enable row level security;

-- ============================================================
-- RPCs — all security definer, execute revoked from browser keys.
-- Only the service-role backend may call these.
-- ============================================================

-- ---------- Officer month-to-date summary for the My Day dashboard
create or replace function public.officer_summary(p_officer_id uuid)
returns json
language sql stable
security definer
set search_path = public
as $$
  with month_orders as (
    select o.amount, o.qty
    from public.orders o
    where o.officer_id = p_officer_id
      and o.channel = 'field'
      and o.status not in ('cancelled','returned')
      and o.placed_at >= date_trunc('month', now())
  ),
  comm as (
    select
      coalesce(sum(amount) filter (where status = 'pending'), 0) as pending,
      coalesce(sum(amount) filter (where status = 'settled'), 0) as settled,
      coalesce(sum(amount) filter (where created_at >= date_trunc('month', now())), 0) as month
    from public.commissions
    where officer_id = p_officer_id
  ),
  vis as (
    select count(*)::int as today
    from public.visits
    where officer_id = p_officer_id
      and visited_at >= date_trunc('day', now())
  ),
  planned as (
    select count(*)::int as n
    from public.leads
    where assigned_officer_id = p_officer_id
  ),
  me as (
    select region, monthly_target from public.profiles where user_id = p_officer_id
  ),
  region_sales as (
    select p.user_id,
           coalesce(sum(o.amount) filter (
             where o.channel = 'field'
               and o.status not in ('cancelled','returned')
               and o.placed_at >= date_trunc('month', now())
           ), 0) as sales
    from public.profiles p
    left join public.orders o on o.officer_id = p.user_id
    where p.region = (select region from me)
    group by p.user_id
  ),
  ranked as (
    select user_id, rank() over (order by sales desc) as rnk, count(*) over () as total
    from region_sales
  )
  select json_build_object(
    'sales_month',        (select coalesce(sum(amount), 0) from month_orders),
    'units_month',        (select coalesce(sum(qty), 0)::int from month_orders),
    'orders_month',       (select count(*)::int from month_orders),
    'commission_pending', (select pending from comm),
    'commission_settled', (select settled from comm),
    'commission_month',   (select month from comm),
    'visits_today',       (select today from vis),
    'visits_planned',     (select n from planned),
    'monthly_target',     (select coalesce((select monthly_target from me), 350000)),
    'region',             (select region from me),
    'region_rank',        (select rnk from ranked where user_id = p_officer_id),
    'region_officers',    (select coalesce(max(total), 0)::int from ranked)
  );
$$;

revoke execute on function public.officer_summary(uuid)
  from public, anon, authenticated;

-- ---------- Officer daily performance series (zero-filled)
create or replace function public.officer_perf_daily(p_officer_id uuid, p_days int)
returns table(day date, orders int, units int, revenue numeric, commission numeric)
language sql stable
security definer
set search_path = public
as $$
  with days as (
    select generate_series(
      current_date - (greatest(1, least(p_days, 90)) - 1),
      current_date,
      interval '1 day'
    )::date as day
  ),
  agg as (
    select o.placed_at::date as day,
           count(*)::int as orders,
           sum(o.qty)::int as units,
           sum(o.amount) as revenue,
           coalesce(sum(c.amount), 0) as commission
    from public.orders o
    left join public.commissions c on c.order_id = o.id
    where o.officer_id = p_officer_id
      and o.channel = 'field'
      and o.status not in ('cancelled','returned')
      and o.placed_at >= current_date - greatest(1, least(p_days, 90))
    group by o.placed_at::date
  )
  select d.day,
         coalesce(a.orders, 0),
         coalesce(a.units, 0),
         coalesce(a.revenue, 0),
         coalesce(a.commission, 0)
  from days d
  left join agg a on a.day = d.day
  order by d.day;
$$;

revoke execute on function public.officer_perf_daily(uuid, int)
  from public, anon, authenticated;

-- ---------- Officer monthly performance series (zero-filled)
create or replace function public.officer_perf_monthly(p_officer_id uuid, p_months int)
returns table(month text, orders int, units int, revenue numeric, commission numeric)
language sql stable
security definer
set search_path = public
as $$
  with months as (
    select generate_series(
      date_trunc('month', now()) - make_interval(months => greatest(1, least(p_months, 24)) - 1),
      date_trunc('month', now()),
      interval '1 month'
    ) as m
  ),
  agg as (
    select date_trunc('month', o.placed_at) as m,
           count(*)::int as orders,
           sum(o.qty)::int as units,
           sum(o.amount) as revenue,
           coalesce(sum(c.amount), 0) as commission
    from public.orders o
    left join public.commissions c on c.order_id = o.id
    where o.officer_id = p_officer_id
      and o.channel = 'field'
      and o.status not in ('cancelled','returned')
      and o.placed_at >= date_trunc('month', now()) - make_interval(months => greatest(1, least(p_months, 24)) - 1)
    group by date_trunc('month', o.placed_at)
  )
  select to_char(mo.m, 'Mon YYYY'),
         coalesce(a.orders, 0),
         coalesce(a.units, 0),
         coalesce(a.revenue, 0),
         coalesce(a.commission, 0)
  from months mo
  left join agg a on a.m = mo.m
  order by mo.m;
$$;

revoke execute on function public.officer_perf_monthly(uuid, int)
  from public, anon, authenticated;

-- ---------- Leaderboard (month sales per officer, optional region filter)
create or replace function public.officer_leaderboard(p_region text default null)
returns table(officer_id uuid, name text, city text, region text, sales numeric, units int, rank int)
language sql stable
security definer
set search_path = public
as $$
  with sales as (
    select p.user_id, p.full_name, p.city, p.region,
           coalesce(sum(o.amount) filter (
             where o.channel = 'field'
               and o.status not in ('cancelled','returned')
               and o.placed_at >= date_trunc('month', now())
           ), 0) as sales,
           coalesce(sum(o.qty) filter (
             where o.channel = 'field'
               and o.status not in ('cancelled','returned')
               and o.placed_at >= date_trunc('month', now())
           ), 0)::int as units
    from public.profiles p
    left join public.orders o on o.officer_id = p.user_id
    where p_region is null or p.region = p_region
    group by p.user_id, p.full_name, p.city, p.region
  )
  select user_id, full_name, city, region, sales, units,
         rank() over (order by sales desc)::int
  from sales
  order by sales desc
  limit 50;
$$;

revoke execute on function public.officer_leaderboard(text)
  from public, anon, authenticated;

-- ---------- Admin: platform-wide summary (reads auth.users)
create or replace function public.admin_summary()
returns json
language sql stable
security definer
set search_path = public
as $$
  select json_build_object(
    'clients',  (select count(*)::int from auth.users
                 where coalesce(raw_user_meta_data->>'role','client') = 'client'
                   and email_confirmed_at is not null),
    'officers', (select count(*)::int from auth.users
                 where raw_user_meta_data->>'role' = 'field'
                   and email_confirmed_at is not null),
    'products_total',  (select count(*)::int from public.products),
    'products_live',   (select count(*)::int from public.products where status = 'live'),
    'products_review', (select count(*)::int from public.products where status = 'review'),
    'orders_total',    (select count(*)::int from public.orders),
    'orders_today',    (select count(*)::int from public.orders
                        where placed_at >= date_trunc('day', now())),
    'revenue_total',   (select coalesce(sum(amount), 0) from public.orders
                        where status not in ('cancelled','returned')),
    'revenue_month',   (select coalesce(sum(amount), 0) from public.orders
                        where status not in ('cancelled','returned')
                          and placed_at >= date_trunc('month', now())),
    'commissions_pending', (select coalesce(sum(amount), 0) from public.commissions
                            where status = 'pending'),
    'commissions_settled', (select coalesce(sum(amount), 0) from public.commissions
                            where status = 'settled')
  );
$$;

revoke execute on function public.admin_summary()
  from public, anon, authenticated;

-- ---------- Admin: clients overview (auth.users + product/order aggregates)
create or replace function public.admin_clients_overview()
returns table(
  id uuid, name text, email text, joined_at timestamptz,
  products_live int, products_total int, gmv numeric, orders int
)
language sql stable
security definer
set search_path = public
as $$
  select u.id,
         coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
         u.email::text,
         u.created_at,
         coalesce(p.live, 0)::int,
         coalesce(p.total, 0)::int,
         coalesce(o.gmv, 0),
         coalesce(o.orders, 0)::int
  from auth.users u
  left join (
    select owner_id,
           count(*) filter (where status = 'live') as live,
           count(*) as total
    from public.products group by owner_id
  ) p on p.owner_id = u.id
  left join (
    select client_id,
           sum(amount) filter (where status not in ('cancelled','returned')) as gmv,
           count(*) as orders
    from public.orders group by client_id
  ) o on o.client_id = u.id
  where coalesce(u.raw_user_meta_data->>'role','client') = 'client'
    and u.email_confirmed_at is not null
  order by coalesce(o.gmv, 0) desc;
$$;

revoke execute on function public.admin_clients_overview()
  from public, anon, authenticated;

-- ---------- Admin: officers overview
create or replace function public.admin_officers_overview()
returns table(
  id uuid, name text, email text, city text, region text, joined_at timestamptz,
  sales_month numeric, units_month int, orders_month int,
  commission_pending numeric, last_sale_at timestamptz
)
language sql stable
security definer
set search_path = public
as $$
  select u.id,
         coalesce(pr.full_name, u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
         u.email::text,
         pr.city,
         pr.region,
         coalesce(pr.joined_at, u.created_at),
         coalesce(o.sales, 0),
         coalesce(o.units, 0)::int,
         coalesce(o.orders, 0)::int,
         coalesce(c.pending, 0),
         o.last_sale_at
  from auth.users u
  left join public.profiles pr on pr.user_id = u.id
  left join (
    select officer_id,
           sum(amount) filter (
             where status not in ('cancelled','returned')
               and placed_at >= date_trunc('month', now())
           ) as sales,
           sum(qty) filter (
             where status not in ('cancelled','returned')
               and placed_at >= date_trunc('month', now())
           ) as units,
           count(*) filter (
             where status not in ('cancelled','returned')
               and placed_at >= date_trunc('month', now())
           ) as orders,
           max(placed_at) as last_sale_at
    from public.orders
    where officer_id is not null
    group by officer_id
  ) o on o.officer_id = u.id
  left join (
    select officer_id, sum(amount) as pending
    from public.commissions
    where status = 'pending'
    group by officer_id
  ) c on c.officer_id = u.id
  where u.raw_user_meta_data->>'role' = 'field'
    and u.email_confirmed_at is not null
  order by coalesce(o.sales, 0) desc;
$$;

revoke execute on function public.admin_officers_overview()
  from public, anon, authenticated;

-- ---------- Admin: revenue by month (zero-filled)
create or replace function public.admin_revenue_by_month(p_months int)
returns table(month text, revenue numeric, orders int, field_share int)
language sql stable
security definer
set search_path = public
as $$
  with months as (
    select generate_series(
      date_trunc('month', now()) - make_interval(months => greatest(1, least(p_months, 24)) - 1),
      date_trunc('month', now()),
      interval '1 month'
    ) as m
  ),
  agg as (
    select date_trunc('month', placed_at) as m,
           sum(amount) as revenue,
           count(*)::int as orders,
           round(100.0 * count(*) filter (where channel = 'field') / count(*))::int as field_share
    from public.orders
    where status not in ('cancelled','returned')
      and placed_at >= date_trunc('month', now()) - make_interval(months => greatest(1, least(p_months, 24)) - 1)
    group by date_trunc('month', placed_at)
  )
  select to_char(mo.m, 'Mon YYYY'),
         coalesce(a.revenue, 0),
         coalesce(a.orders, 0),
         coalesce(a.field_share, 0)
  from months mo
  left join agg a on a.m = mo.m
  order by mo.m;
$$;

revoke execute on function public.admin_revenue_by_month(int)
  from public, anon, authenticated;

-- ---------- Admin: region stats (field sales this month + MoM growth)
create or replace function public.admin_region_stats()
returns table(region text, sales numeric, officers int, growth numeric)
language sql stable
security definer
set search_path = public
as $$
  with by_region as (
    select p.region,
           count(distinct p.user_id)::int as officers,
           coalesce(sum(o.amount) filter (
             where o.status not in ('cancelled','returned')
               and o.placed_at >= date_trunc('month', now())
           ), 0) as this_month,
           coalesce(sum(o.amount) filter (
             where o.status not in ('cancelled','returned')
               and o.placed_at >= date_trunc('month', now()) - interval '1 month'
               and o.placed_at < date_trunc('month', now())
           ), 0) as prev_month
    from public.profiles p
    left join public.orders o on o.officer_id = p.user_id and o.channel = 'field'
    where p.region is not null
    group by p.region
  )
  select region, this_month, officers,
         case when prev_month = 0 then 0
              else round(100.0 * (this_month - prev_month) / prev_month, 1) end
  from by_region
  order by this_month desc;
$$;

revoke execute on function public.admin_region_stats()
  from public, anon, authenticated;

-- ---------- Admin: top products by revenue
create or replace function public.admin_top_products(p_limit int)
returns table(product_id uuid, name text, image text, units int, revenue numeric)
language sql stable
security definer
set search_path = public
as $$
  select p.id, p.name, (p.images)[1],
         sum(o.qty)::int, sum(o.amount)
  from public.orders o
  join public.products p on p.id = o.product_id
  where o.status not in ('cancelled','returned')
  group by p.id, p.name, p.images
  order by sum(o.amount) desc
  limit greatest(1, least(p_limit, 50));
$$;

revoke execute on function public.admin_top_products(int)
  from public, anon, authenticated;

-- ---------- Helper: ids of all admin users (for the notify service)
create or replace function public.admin_user_ids()
returns setof uuid
language sql stable
security definer
set search_path = public
as $$
  select id from auth.users
  where raw_user_meta_data->>'role' = 'admin'
    and email_confirmed_at is not null;
$$;

revoke execute on function public.admin_user_ids()
  from public, anon, authenticated;

-- ---------- Helper: display names for a set of user ids
create or replace function public.user_names(p_ids uuid[])
returns table(id uuid, name text)
language sql stable
security definer
set search_path = public
as $$
  select u.id,
         coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
  from auth.users u
  where u.id = any(p_ids);
$$;

revoke execute on function public.user_names(uuid[])
  from public, anon, authenticated;
