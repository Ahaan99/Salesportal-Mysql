#!/usr/bin/env node
/**
 * Seller category migration — adds profiles.seller_category so the portal
 * supports two ways to sell:
 *   'field'       — Field Sales Person (territory beat, admin-set targets)
 *   'independent' — Independent Seller (anyone can join and sell)
 *
 * Run: node db/migrate-seller-category.js   (from the backend folder)
 * Idempotent — safe to re-run.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// Load backend/.env when present so the script just works locally.
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
    console.error("[migrate-seller-category] SUPABASE_DB_URL is not set. Add it to backend/.env.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("[migrate-seller-category] Connected to database");

    // Guard: profiles must exist first.
    const deps = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'profiles'`
    );
    if (deps.rows.length < 1) {
      console.error(
        "[migrate-seller-category] Missing profiles table. Run `node db/migrate-portal.js` first."
      );
      process.exit(1);
    }

    const schemaPath = path.join(__dirname, "seller-category-schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    console.log("[migrate-seller-category] Applying seller category schema...");
    await client.query(schemaSql);

    const check = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'profiles'
         AND column_name = 'seller_category'`
    );
    if (check.rows.length === 0) {
      console.error("[migrate-seller-category] Verification failed: seller_category column not found.");
      process.exit(1);
    }
    console.log("[migrate-seller-category] Verified: profiles.seller_category exists");
    console.log("[migrate-seller-category] Done.");
  } catch (err) {
    console.error("[migrate-seller-category] Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

runMigration();
