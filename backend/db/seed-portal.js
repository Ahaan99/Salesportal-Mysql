#!/usr/bin/env node
/**
 * Recruweb Sales Portal — field-officer / portal seed
 *
 * Usage:  node db/seed-portal.js           (idempotent, skips what exists)
 *         node db/seed-portal.js --force   (re-seeds leads & visits)
 *
 * Requires db/migrate-portal.js to have been applied. Steps:
 *   1. Create real auth accounts for the 12 seeded officer names
 *      (ravi.deshmukh@recruweb-field.test … / FIELD_SEED_PASSWORD)
 *      plus a profile row each (city/state/region + monthly target).
 *   2. Backfill orders.officer_id on historical field orders by name.
 *   3. Generate commissions (8%) from historical field orders.
 *   4. Seed ~40 leads across officer cities + ~150 visits (some today).
 *   5. Seed a handful of admin notifications.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require("pg");
const { supabaseAdmin } = require("../src/config/supabase");
const { regionForState } = require("../src/utils/regions");

const FORCE = process.argv.includes("--force");
const FIELD_PASSWORD = process.env.FIELD_SEED_PASSWORD || "Field@12345";
const COMMISSION_RATE = 0.08;

// Officer names must match db/seed.js OFFICERS exactly — the backfill
// joins historical orders on officer_name.
const OFFICERS = [
  { name: "Ravi Deshmukh", city: "Pune", state: "Maharashtra" },
  { name: "Priya Sharma", city: "Delhi", state: "Delhi" },
  { name: "Sunil Jadhav", city: "Mumbai", state: "Maharashtra" },
  { name: "Asha Gowda", city: "Bengaluru", state: "Karnataka" },
  { name: "Imran Qureshi", city: "Hyderabad", state: "Telangana" },
  { name: "Neha Kkohli", city: "Chandigarh", state: "Chandigarh" },
  { name: "Prakash Rathod", city: "Ahmedabad", state: "Gujarat" },
  { name: "Geeta Solanki", city: "Jaipur", state: "Rajasthan" },
  { name: "Mohit Chandel", city: "Lucknow", state: "Uttar Pradesh" },
  { name: "Rekha Naik", city: "Kochi", state: "Kerala" },
  { name: "Vijay Pawar", city: "Nagpur", state: "Maharashtra" },
  { name: "Sarita Devi", city: "Patna", state: "Bihar" },
];

const SHOP_PREFIXES = [
  "Sunrise", "Balaji", "Shree", "New Modern", "Ganesh", "Laxmi", "Om", "Royal",
  "Apna", "City", "Metro", "Star", "Golden", "Annapurna", "Krishna", "Sai",
];
const SHOP_TYPES = ["Kirana", "Super Store", "Mart", "General Store", "Traders", "Provision Store"];
const AREAS = [
  "Kothrud", "Baner", "MG Road", "Station Road", "Market Yard", "Gandhi Nagar",
  "Civil Lines", "Sadar Bazaar", "Old City", "Nehru Place", "Ring Road", "Main Bazaar",
];
const OWNER_NAMES = [
  "Ramesh Patel", "Suresh Gupta", "Mahesh Shah", "Dinesh Kumar", "Kiran Rao",
  "Anil Joshi", "Sanjay Verma", "Manoj Singh", "Ashok Reddy", "Vinod Agarwal",
];
const OUTCOMES = ["ordered", "ordered", "interested", "interested", "follow-up", "not-interested"];

// deterministic PRNG so re-seeds are reproducible (same as db/seed.js)
let seedState = 1337;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

const emailFor = (name) =>
  name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".") +
  "@recruweb-field.test";

async function connect() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set in backend/.env");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

// ------------------------------------------------ 1. officer accounts + profiles
async function seedOfficers(db) {
  console.log("[seed-portal] officer accounts...");

  // Existing accounts, so re-runs converge (createUser is not transactional
  // with the pg writes below).
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw new Error("listUsers failed: " + listErr.message);
  const byEmail = new Map(list.users.map((u) => [(u.email || "").toLowerCase(), u]));

  const officers = [];
  for (const o of OFFICERS) {
    const email = emailFor(o.name);
    let user = byEmail.get(email);
    if (!user) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: FIELD_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: o.name, role: "field" },
      });
      if (error) throw new Error(`createUser ${email} failed: ${error.message}`);
      user = data.user;
      console.log(`  + created ${email}`);
    }
    officers.push({ ...o, id: user.id, email });

    await db.query(
      `insert into profiles (user_id, full_name, phone, city, state, region, monthly_target, joined_at)
       values ($1, $2, $3, $4, $5, $6, $7, now() - interval '200 days')
       on conflict (user_id) do update
         set city = excluded.city, state = excluded.state, region = excluded.region`,
      [
        user.id,
        o.name,
        `+91 9${String(randInt(100000000, 999999999))}`,
        o.city,
        o.state,
        regionForState(o.state),
        randInt(30, 40) * 10000,
      ]
    );
  }
  console.log(`[seed-portal] ✓ ${officers.length} officers ready`);
  return officers;
}

// ------------------------------------------------ 2. backfill orders.officer_id
async function backfillOrders(db, officers) {
  console.log("[seed-portal] backfilling orders.officer_id...");
  let total = 0;
  for (const o of officers) {
    const { rowCount } = await db.query(
      `update orders set officer_id = $1
       where channel = 'field' and officer_name = $2 and officer_id is null`,
      [o.id, o.name]
    );
    total += rowCount;
  }
  console.log(`[seed-portal] ✓ ${total} orders linked to officers`);
}

// ------------------------------------------------ 3. commissions from history
async function seedCommissions(db) {
  console.log("[seed-portal] commissions...");
  const { rowCount } = await db.query(
    `insert into commissions (order_id, officer_id, rate, amount, status, settled_at, created_at)
     select o.id, o.officer_id, $1,
            round(o.amount * $1, 2),
            case when o.status = 'delivered' and o.placed_at < now() - interval '7 days'
                 then 'settled' else 'pending' end,
            case when o.status = 'delivered' and o.placed_at < now() - interval '7 days'
                 then o.placed_at + interval '7 days' end,
            o.placed_at
     from orders o
     where o.channel = 'field'
       and o.officer_id is not null
       and o.status not in ('cancelled','returned')
     on conflict (order_id) do nothing`,
    [COMMISSION_RATE]
  );
  console.log(`[seed-portal] ✓ ${rowCount} commissions created`);
}

// ------------------------------------------------ 4. leads + visits
async function seedLeadsAndVisits(db, officers) {
  const { rows: [{ n: existing }] } = await db.query("select count(*)::int as n from leads");
  if (existing > 10 && !FORCE) {
    console.log(`[seed-portal] leads already seeded (${existing}) — skipping (use --force)`);
    return;
  }
  if (FORCE) {
    await db.query("delete from visits");
    await db.query("delete from leads");
  }

  console.log("[seed-portal] leads + visits...");
  const leadIds = [];
  const usedNames = new Set();
  for (let i = 0; i < 42; i++) {
    const officer = officers[i % officers.length];
    let shop;
    do {
      shop = `${pick(SHOP_PREFIXES)} ${pick(SHOP_TYPES)}`;
    } while (usedNames.has(shop + officer.city));
    usedNames.add(shop + officer.city);
    const { rows: [lead] } = await db.query(
      `insert into leads (shop_name, owner_name, phone, area, city, state, potential, assigned_officer_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, assigned_officer_id`,
      [
        shop,
        pick(OWNER_NAMES),
        `+91 8${String(randInt(100000000, 999999999))}`,
        pick(AREAS),
        officer.city,
        officer.state,
        pick(["hot", "hot", "warm", "warm", "warm", "cold"]),
        officer.id,
      ]
    );
    leadIds.push(lead);
  }

  // ~150 visits over the last 30 days
  const now = Date.now();
  let visitCount = 0;
  for (let i = 0; i < 150; i++) {
    const lead = pick(leadIds);
    const visitedAt = new Date(now - randInt(1, 30 * 24 * 60) * 60 * 1000);
    await db.query(
      `insert into visits (lead_id, officer_id, outcome, note, visited_at)
       values ($1, $2, $3, $4, $5)`,
      [lead.id, lead.assigned_officer_id, pick(OUTCOMES), null, visitedAt.toISOString()]
    );
    visitCount++;
  }
  // a few visits TODAY spread across the first officers, so "Visits today"
  // is non-zero on demo day
  for (let i = 0; i < 5; i++) {
    const lead = leadIds[i];
    await db.query(
      `insert into visits (lead_id, officer_id, outcome, note, visited_at)
       values ($1, $2, $3, $4, now() - make_interval(mins => $5))`,
      [lead.id, lead.assigned_officer_id, pick(OUTCOMES), "Stock check + reorder discussion", randInt(30, 300)]
    );
    visitCount++;
  }
  await db.query(
    `update leads l set last_visit_at = v.latest
     from (select lead_id, max(visited_at) as latest from visits group by lead_id) v
     where v.lead_id = l.id`
  );
  console.log(`[seed-portal] ✓ ${leadIds.length} leads, ${visitCount} visits`);
}

// ------------------------------------------------ 5. admin notifications
async function seedNotifications(db) {
  const { rows: admins } = await db.query(
    `select id from auth.users where raw_user_meta_data->>'role' = 'admin'`
  );
  if (!admins.length) {
    console.log("[seed-portal] no admin users — skipping notifications (run create-admin.js first)");
    return;
  }
  const { rows: [{ n: existing }] } = await db.query(
    "select count(*)::int as n from notifications"
  );
  if (existing > 5 && !FORCE) {
    console.log(`[seed-portal] notifications already seeded (${existing}) — skipping`);
    return;
  }

  const { rows: recentOrders } = await db.query(
    `select order_no, amount, officer_name from orders
     where channel = 'field' order by placed_at desc limit 5`
  );
  const { rows: reviewProducts } = await db.query(
    `select name from products where status = 'review' limit 3`
  );

  let count = 0;
  for (const admin of admins) {
    for (const o of recentOrders) {
      await db.query(
        `insert into notifications (user_id, type, title, body, link, created_at)
         values ($1, 'order', $2, $3, '/admin/orders', now() - make_interval(mins => $4))`,
        [
          admin.id,
          `Field order ${o.order_no}`,
          `₹${Number(o.amount).toLocaleString("en-IN")} placed by ${o.officer_name}`,
          randInt(60, 2000),
        ]
      );
      count++;
    }
    for (const p of reviewProducts) {
      await db.query(
        `insert into notifications (user_id, type, title, body, link, created_at)
         values ($1, 'product', 'Product awaiting review', $2, '/admin/products', now() - make_interval(mins => $3))`,
        [admin.id, `"${p.name}" was submitted for approval`, randInt(60, 3000)]
      );
      count++;
    }
  }
  console.log(`[seed-portal] ✓ ${count} notifications`);
}

// ------------------------------------------------ main
(async () => {
  const db = await connect();
  try {
    // Guard: portal tables must exist
    const { rows } = await db.query(
      `select count(*)::int as n from information_schema.tables
       where table_schema = 'public'
         and table_name in ('profiles','commissions','notifications','leads','visits')`
    );
    if (rows[0].n !== 5) {
      throw new Error("Portal tables missing — run `node db/migrate-portal.js` first");
    }

    const officers = await seedOfficers(db);
    await backfillOrders(db, officers);
    await seedCommissions(db);
    await seedLeadsAndVisits(db, officers);
    await seedNotifications(db);

    console.log("\n[seed-portal] ALL DONE");
    console.log(`[seed-portal] Officer login: ravi.deshmukh@recruweb-field.test / ${FIELD_PASSWORD}`);
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error("[seed-portal] FATAL:", e.message);
  process.exit(1);
});
