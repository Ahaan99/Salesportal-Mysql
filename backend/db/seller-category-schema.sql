-- ============================================================
-- Seller categories — two ways to sell on Recruweb:
--   'field'       : Field Sales Person (assigned beat/territory, KYC, targets)
--   'independent' : Independent Seller (anyone can join and sell from anywhere)
--
-- Applied by: backend/db/migrate-seller-category.js
-- Safe to re-run: uses IF NOT EXISTS / idempotent guards.
-- ============================================================

alter table public.profiles
  add column if not exists seller_category text not null default 'field'
  check (seller_category in ('field', 'independent'));

create index if not exists idx_profiles_seller_category
  on public.profiles(seller_category);

comment on column public.profiles.seller_category is
  'field = Field Sales Person (territory-based), independent = Independent Seller (open to anyone)';
