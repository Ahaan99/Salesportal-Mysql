-- performance-indexes.sql
-- Covering indexes for the API's hottest query paths. All statements are
-- idempotent (IF NOT EXISTS) and safe to re-run. Applied to the live
-- database on 21 Jul 2026 alongside the auth-middleware verification cache
-- that removed the per-request Supabase Auth round trip.

-- "My Products": products filtered by owner, newest first (paged)
CREATE INDEX IF NOT EXISTS idx_products_owner_created ON products (owner_id, created_at DESC);
-- Admin review queue + storefront visibility filters
CREATE INDEX IF NOT EXISTS idx_products_status        ON products (status);
-- Category browsing
CREATE INDEX IF NOT EXISTS idx_products_category      ON products (category_id);

-- Client order history, newest first (paged)
CREATE INDEX IF NOT EXISTS idx_orders_client_created  ON orders (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON orders (status);

-- Returns dashboard
CREATE INDEX IF NOT EXISTS idx_returns_client_created ON returns (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_status         ON returns (status);

-- Refund tracking
CREATE INDEX IF NOT EXISTS idx_refunds_client_created ON refunds (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_return         ON refunds (return_id);
