-- patch-client-id-nullable.sql
-- Run once in Supabase SQL editor (or psql) to allow field-channel orders
-- that are not yet linked to a client account.
-- Safe to re-run: "DROP NOT NULL" is idempotent.

alter table public.orders
  alter column client_id drop not null;

comment on column public.orders.client_id is
  'Nullable: filled once client-account management is live. '
  'Field-channel orders created from sales_submissions leave this null.';
