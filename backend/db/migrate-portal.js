#!/usr/bin/env node
/**
 * Portal migration — profiles, commissions, notifications, leads, visits,
 * orders.officer_id and the field/admin dashboard RPCs.
 * Run: node db/migrate-portal.js   (from the backend folder)
 *
 * Reads SUPABASE_DB_URL from the environment (or backend/.env when run
 * locally). Idempotent — safe to re-run.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// Load backend/.env when present so `node db/migrate-portal.js` just works.
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

const EXPECTED_TABLES = ["profiles", "commissions", "notifications", "leads", "visits"];

async function runMigration() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("[migrate-portal] SUPABASE_DB_URL is not set. Add it to backend/.env.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("[migrate-portal] Connected to database");

    const schemaPath = path.join(__dirname, "portal-schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    console.log("[migrate-portal] Applying portal schema...");
    await client.query(schemaSql);
    console.log("[migrate-portal] ✓ Portal schema applied");

    const check = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)
       ORDER BY table_name`,
      [EXPECTED_TABLES]
    );
    console.log(`[migrate-portal] ✓ Verified ${check.rows.length}/${EXPECTED_TABLES.length} tables:`);
    check.rows.forEach((r) => console.log(`  • ${r.table_name}`));
    if (check.rows.length !== EXPECTED_TABLES.length) {
      throw new Error("Expected all portal tables to exist after migration");
    }

    const col = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders'
        AND column_name IN ('officer_id', 'customer_phone')
    `);
    console.log(`[migrate-portal] ✓ Verified ${col.rows.length}/2 new orders columns`);
    if (col.rows.length !== 2) {
      throw new Error("Expected orders.officer_id and orders.customer_phone to exist");
    }

    console.log("\n[migrate-portal] ✓ Migration completed successfully!");
  } catch (err) {
    console.error("[migrate-portal] Error:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

runMigration();
