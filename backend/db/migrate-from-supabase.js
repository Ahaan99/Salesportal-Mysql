/**
 * One-time data migration: Supabase (Postgres) → local MySQL.
 *
 * Usage:  node db/migrate-from-supabase.js            (dry run — counts only)
 *         node db/migrate-from-supabase.js --apply    (actually write)
 *
 * What it does:
 *   1. auth.users → users
 *      - Supabase stores bcrypt hashes ($2a$…) in auth.users.encrypted_password.
 *        bcryptjs verifies these natively, so every existing password keeps
 *        working after migration — no resets needed.
 *      - role comes from public.profiles.role (fallback: user_metadata.role,
 *        then 'client').
 *   2. Every public.* table that also exists in MySQL is copied using the
 *      intersection of its columns (extra PG columns are ignored).
 *   3. Idempotent: INSERT IGNORE everywhere — rows that already exist in
 *      MySQL (matched by primary key) are left untouched, so re-running is
 *      safe and the seeded local data is never overwritten.
 *   4. FK checks are disabled for the session so copy order doesn't matter.
 *
 * Requires SUPABASE_DB_URL in backend/.env and the local MYSQL_* vars.
 */
require("dotenv").config();
const { Client } = require("pg");
const mysql = require("mysql2/promise");

const APPLY = process.argv.includes("--apply");

// Copy order: parents before children (informational only — FK checks are off).
const TABLES = [
  "profiles",
  "categories",
  "products",
  "orders",
  "returns",
  "refunds",
  "leads",
  "lead_notes",
  "lead_follow_ups",
  "crm_tasks",
  "meetings",
  "visits",
  "sales_submissions",
  "commissions",
  "officer_wallets",
  "payout_requests",
  "kyc_submissions",
  "kyc_documents",
  "chat_threads",
  "chat_messages",
  "notifications",
  "notification_settings",
];

function toMysqlDateTime(d) {
  return d.toISOString().slice(0, 23).replace("T", " ");
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function convert(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return toMysqlDateTime(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && ISO_RE.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return toMysqlDateTime(d);
  }
  if (Array.isArray(v) || typeof v === "object") return JSON.stringify(v);
  return v;
}

async function main() {
  if (!process.env.SUPABASE_DB_URL) {
    console.error("SUPABASE_DB_URL missing in backend/.env");
    process.exit(1);
  }

  const pg = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  console.log("Connected to Supabase Postgres.");

  const my = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || "salesportal",
    timezone: "Z",
    charset: "utf8mb4_unicode_ci",
  });
  console.log("Connected to MySQL.");
  await my.query("SET FOREIGN_KEY_CHECKS=0");

  const summary = [];

  /* ── 1. auth.users → users ─────────────────────────────────────────── */
  const { rows: authUsers } = await pg.query(`
    SELECT u.id, u.email, u.encrypted_password, u.email_confirmed_at,
           u.last_sign_in_at, u.created_at,
           u.raw_user_meta_data AS meta,
           u.raw_user_meta_data->>'role' AS profile_role,
           COALESCE(p.full_name, u.raw_user_meta_data->>'full_name') AS full_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.deleted_at IS NULL
  `);

  let uIns = 0, uSkip = 0, uNoHash = 0;
  for (const r of authUsers) {
    const hash = r.encrypted_password || "";
    if (!hash.startsWith("$2")) { uNoHash++; continue; } // OAuth/magic-link-only accounts
    const role = ["admin", "client", "field"].includes(r.profile_role || (r.meta && r.meta.role))
      ? (r.profile_role || r.meta.role)
      : "client";
    if (!APPLY) { uIns++; continue; }
    const [res] = await my.execute(
      `INSERT IGNORE INTO users
         (id, email, password_hash, full_name, role, email_confirmed_at, last_sign_in_at, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        r.id,
        (r.email || "").toLowerCase(),
        hash,
        r.full_name || null,
        role,
        convert(r.email_confirmed_at),
        convert(r.last_sign_in_at),
        convert(r.created_at) || toMysqlDateTime(new Date()),
      ]
    );
    res.affectedRows ? uIns++ : uSkip++;
  }
  summary.push({ table: "users (auth.users)", source: authUsers.length, inserted: uIns, skipped: uSkip, noHash: uNoHash });

  /* ── 2. public tables (column intersection, INSERT IGNORE) ─────────── */
  for (const table of TABLES) {
    // Does the table exist on both sides?
    const { rows: pgCols } = await pg.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1`, [table]);
    if (pgCols.length === 0) { summary.push({ table, source: "-", note: "not in Supabase" }); continue; }

    const [myColsRows] = await my.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
       WHERE table_schema=DATABASE() AND table_name=?`, [table]);
    if (myColsRows.length === 0) { summary.push({ table, source: "-", note: "not in MySQL" }); continue; }

    const pgSet = new Set(pgCols.map((r) => r.column_name));
    const cols = myColsRows.map((r) => r.c).filter((c) => pgSet.has(c));
    if (cols.length === 0) { summary.push({ table, source: "-", note: "no shared columns" }); continue; }

    const { rows } = await pg.query(`SELECT ${cols.map((c) => `"${c}"`).join(",")} FROM public."${table}"`);
    let ins = 0, skip = 0, fail = 0;
    if (APPLY && rows.length) {
      const sql = `INSERT IGNORE INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(",")})
                   VALUES (${cols.map(() => "?").join(",")})`;
      for (const row of rows) {
        try {
          const [res] = await my.execute(sql, cols.map((c) => convert(row[c])));
          res.affectedRows ? ins++ : skip++;
        } catch (e) {
          fail++;
          if (fail <= 3) console.error(`  [${table}] row failed: ${e.message}`);
        }
      }
    }
    summary.push({ table, source: rows.length, inserted: APPLY ? ins : "(dry)", skipped: skip, failed: fail || undefined });
  }

  await my.query("SET FOREIGN_KEY_CHECKS=1");
  await my.end();
  await pg.end();

  console.log(`\n${APPLY ? "MIGRATION RESULT" : "DRY RUN (pass --apply to write)"}`);
  console.table(summary);
}

main().catch((e) => { console.error("Migration failed:", e.message); process.exit(1); });
