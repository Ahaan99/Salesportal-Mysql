#!/usr/bin/env node
/**
 * Migration: stock_adjustments + company_profiles tables.
 * Applies backend/db/schema.sql (idempotent) — NO sample data is seeded.
 * Run: node db/migrate-inventory-profile.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function run() {
  const connectionString =
    process.env.SUPABASE_DB_URL ||
    "postgresql://postgres.pwawfxpyroejzxskagbw:Supa1234Base0987@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres";

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  await client.connect();
  console.log("[migrate-inventory-profile] Connected to database");

  const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  console.log("[migrate-inventory-profile] Applying schema...");
  await client.query(schemaSql);

  const check = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('stock_adjustments', 'company_profiles')
    ORDER BY table_name
  `);
  for (const row of check.rows) console.log(`  \u2713 ${row.table_name}`);
  if (check.rows.length !== 2) throw new Error("Expected both tables to exist after migration.");

  console.log("[migrate-inventory-profile] DONE — no sample data was inserted.");
  await client.end();
}

run().catch((e) => {
  console.error("[migrate-inventory-profile] FATAL:", e.message);
  process.exit(1);
});
