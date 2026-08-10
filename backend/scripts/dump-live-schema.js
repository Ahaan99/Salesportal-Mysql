// Dumps the LIVE Supabase Postgres schema (public tables + auth.users) as JSON.
// Usage: node scripts/dump-live-schema.js
require("dotenv").config();
const { Client } = require("pg");

(async () => {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const cols = await client.query(`
    select table_name, column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `);

  const counts = await client.query(`
    select relname as table_name, n_live_tup as approx_rows
    from pg_stat_user_tables
    where schemaname = 'public'
    order by relname
  `);

  const authCols = await client.query(`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
    order by ordinal_position
  `);

  const userCount = await client.query(`select count(*)::int as n from auth.users`);

  const out = {
    tables: {},
    counts: Object.fromEntries(counts.rows.map((r) => [r.table_name, Number(r.approx_rows)])),
    auth_users_columns: authCols.rows.map((r) => r.column_name),
    auth_users_count: userCount.rows[0].n,
  };
  for (const r of cols.rows) {
    (out.tables[r.table_name] ||= []).push(
      `${r.column_name} ${r.udt_name}${r.is_nullable === "YES" ? " NULL" : ""}${r.column_default ? " DEF=" + r.column_default.slice(0, 40) : ""}`
    );
  }
  console.log(JSON.stringify(out, null, 1));
  await client.end();
})().catch((e) => {
  console.error("DUMP_FAILED:", e.message);
  process.exit(1);
});
