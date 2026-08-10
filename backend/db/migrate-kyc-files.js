/**
 * One-time: download every kyc_documents file from Supabase Storage
 * (bucket "kyc-docs") into backend/uploads/kyc-docs/<storage_path>.
 *
 * Uses the Storage REST API directly with the service-role key, so it
 * works even though @supabase/supabase-js has been removed elsewhere.
 *
 * Usage: node db/migrate-kyc-files.js
 */
require("dotenv").config();
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const mysql = require("mysql2/promise");

// SUPABASE_URL in this .env is the Postgres connection string — derive the
// https API origin from the project ref (db.<ref>.supabase.co → <ref>.supabase.co).
function apiOrigin() {
  const raw = process.env.SUPABASE_URL || "";
  if (raw.startsWith("http")) return raw.replace(/\/+$/, "");
  const m = raw.match(/db\.([a-z0-9]+)\.supabase\.co/);
  return m ? `https://${m[1]}.supabase.co` : null;
}
const SUPABASE_URL = apiOrigin();
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROOT = path.resolve(__dirname, "../uploads/kyc-docs");

async function main() {
  if (!SUPABASE_URL || !KEY) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in backend/.env");
    process.exit(1);
  }

  const my = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || "salesportal",
  });

  const [docs] = await my.query("SELECT id, storage_path, file_name FROM kyc_documents");
  console.log(`Found ${docs.length} kyc_documents rows.`);

  let ok = 0, skipped = 0, failed = 0;
  for (const d of docs) {
    const dest = path.resolve(ROOT, d.storage_path.replace(/^\/+/, ""));
    if (!dest.startsWith(ROOT)) { console.error(`  SKIP unsafe path: ${d.storage_path}`); failed++; continue; }
    if (fs.existsSync(dest)) { skipped++; continue; }

    const url = `${SUPABASE_URL}/storage/v1/object/kyc-docs/${d.storage_path}`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}`, apikey: KEY } });
      if (!res.ok) {
        console.error(`  FAIL ${d.storage_path}: HTTP ${res.status}`);
        failed++;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, buf);
      console.log(`  OK   ${d.storage_path} (${buf.length} bytes)`);
      ok++;
    } catch (e) {
      console.error(`  FAIL ${d.storage_path}: ${e.message}`);
      failed++;
    }
  }

  await my.end();
  console.log(`\nDone. downloaded=${ok} already-present=${skipped} failed=${failed}`);
}

main().catch((e) => { console.error("Failed:", e.message); process.exit(1); });
