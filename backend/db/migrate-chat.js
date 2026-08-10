#!/usr/bin/env node
/**
 * Support Chat migration — creates chat_threads and chat_messages.
 * Run: node db/migrate-chat.js   (from the backend folder)
 *
 * Reads SUPABASE_DB_URL from the environment (or backend/.env when run
 * locally). Idempotent — safe to re-run.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// Load backend/.env when present so `node db/migrate-chat.js` just works.
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
    console.error("[migrate-chat] SUPABASE_DB_URL is not set. Add it to backend/.env.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("[migrate-chat] Connected to database");

    const schemaPath = path.join(__dirname, "chat-schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    console.log("[migrate-chat] Applying chat schema...");
    await client.query(schemaSql);
    console.log("[migrate-chat] ✓ Chat schema applied");

    const check = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('chat_threads', 'chat_messages')
      ORDER BY table_name
    `);
    console.log(`[migrate-chat] ✓ Verified ${check.rows.length}/2 tables:`);
    check.rows.forEach((r) => console.log(`  • ${r.table_name}`));

    if (check.rows.length !== 2) {
      throw new Error("Expected chat_threads and chat_messages to exist after migration");
    }

    console.log("\n[migrate-chat] ✓ Migration completed successfully!");
  } catch (err) {
    console.error("[migrate-chat] Error:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

runMigration();
