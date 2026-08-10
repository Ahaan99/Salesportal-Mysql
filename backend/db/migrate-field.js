#!/usr/bin/env node
/**
 * Field migration — the place_field_order RPC used by the Field Officer
 * dashboard to place customer orders atomically (stock decrement, order,
 * commission, and vendor notification in one transaction).
 *
 * Run: node db/migrate-field.js   (from the backend folder)
 *
 * Reads SUPABASE_DB_URL from the environment (or backend/.env when run
 * locally). Idempotent — safe to re-run.
 *
 * Requires portal-schema.sql to have been applied first
 * (node db/migrate-portal.js).
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// Load backend/.env when present so `node db/migrate-field.js` just works.
try {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
} catch {
  /* .env is optional — env vars may already be set */
}

async function runMigration() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("[migrate-field] SUPABASE_DB_URL is not set. Add it to backend/.env.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("[migrate-field] Connected to database");

    // Guard: portal tables must exist first (commissions/notifications).
    const deps = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [["commissions", "notifications", "profiles"]]
    );
    if (deps.rows.length < 3) {
      console.error(
        "[migrate-field] Missing portal tables. Run `node db/migrate-portal.js` first."
      );
      process.exit(1);
    }

    const schemaPath = path.join(__dirname, "field-schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    console.log("[migrate-field] Applying field schema...");
    await client.query(schemaSql);
    console.log("[migrate-field] ✓ Field schema applied");

    const check = await client.query(
      `SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'place_field_order'`
    );
    if (check.rows.length === 0) {
      console.error("[migrate-field] Verification failed: place_field_order not found.");
      process.exit(1);
    }
    console.log("[migrate-field] ✓ Verified: public.place_field_order exists");
    console.log("[migrate-field] Done.");
  } catch (err) {
    console.error("[migrate-field] Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

runMigration();
