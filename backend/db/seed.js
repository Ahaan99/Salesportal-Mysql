/**
 * Recruweb Sales Portal — database bootstrap + seed
 *
 * Usage:  node db/seed.js           (skips seeding if data already present)
 *         node db/seed.js --force   (re-seeds catalog & orders)
 *
 * Applies db/schema.sql, then seeds:
 *   - ~800 category nodes (departments > categories > subcategories)
 *   - ~750 products built from the DummyJSON open dataset (real CDN images)
 *   - ~2,600 orders spread across the last 180 days
 *
 * Connection: tries SUPABASE_DB_URL, then SUPABASE_URL (direct, IPv6),
 * then the IPv4 Supavisor pooler derived from the project id.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const taxonomy = require("./taxonomy");

const FORCE = process.argv.includes("--force");
const PROJECT_ID = process.env.SUPABASE_PROJECT_ID || "pwawfxpyroejzxskagbw";
const DB_PASSWORD = process.env.SUPABASE_DATABASE_PASSWORD;

function candidateUrls() {
  const urls = [];
  if (process.env.SUPABASE_DB_URL) urls.push(process.env.SUPABASE_DB_URL);
  if (process.env.SUPABASE_URL && process.env.SUPABASE_URL.startsWith("postgres")) {
    urls.push(process.env.SUPABASE_URL);
  }
  if (DB_PASSWORD) {
    urls.push(
      `postgresql://postgres.${PROJECT_ID}:${DB_PASSWORD}@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres`
    );
  }
  return urls;
}

async function connect() {
  const urls = candidateUrls();
  if (!urls.length) throw new Error("No database credentials in backend/.env");
  let lastErr;
  for (const url of urls) {
    const client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    try {
      await client.connect();
      const host = new URL(url.replace("postgresql://", "http://")).hostname;
      console.log(`[seed] connected via ${host}`);
      return client;
    } catch (e) {
      lastErr = e;
      console.log(`[seed] connection failed (${e.message.slice(0, 60)}), trying next...`);
      try { await client.end(); } catch {}
    }
  }
  throw lastErr;
}

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// deterministic PRNG so re-seeds are reproducible
let seedState = 42;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

// ---------------------------------------------------------- categories
async function seedCategories(db) {
  console.log("[seed] categories...");
  let count = 0;
  for (const dept of taxonomy) {
    const deptSlug = slugify(dept.name);
    const { rows: [d] } = await db.query(
      `insert into categories (name, slug, level, sort_order)
       values ($1, $2, 0, $3)
       on conflict (slug) do update set name = excluded.name
       returning id`,
      [dept.name, deptSlug, count++]
    );
    let catOrder = 0;
    for (const [catName, subs] of Object.entries(dept.cats)) {
      const catSlug = slugify(`${dept.name}-${catName}`);
      const { rows: [c] } = await db.query(
        `insert into categories (name, slug, parent_id, level, sort_order)
         values ($1, $2, $3, 1, $4)
         on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id
         returning id`,
        [catName, catSlug, d.id, catOrder++]
      );
      for (let i = 0; i < subs.length; i++) {
        await db.query(
          `insert into categories (name, slug, parent_id, level, sort_order)
           values ($1, $2, $3, 2, $4)
           on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id`,
          [subs[i], slugify(`${catName}-${subs[i]}`), c.id, i]
        );
      }
    }
  }
  const { rows: [{ n }] } = await db.query("select count(*)::int as n from categories");
  console.log(`[seed] categories done — ${n} nodes`);
}

// ---------------------------------------------------------- products
// DummyJSON category -> our subcategory slug (see taxonomy.js)
const DJ_CATEGORY_MAP = {
  beauty: "makeup-makeup-kits",
  fragrances: "fragrances-perfumes",
  furniture: "outdoor-living-outdoor-furniture",
  groceries: "packaged-food-ready-to-eat",
  "home-decoration": "home-decor-wall-decor",
  "kitchen-accessories": "kitchen-tools-knives-and-choppers",
  laptops: "computers-laptops",
  "mens-shirts": "topwear-casual-shirts",
  "mens-shoes": "footwear-casual-shoes",
  "mens-watches": "accessories-watches",
  "mobile-accessories": "mobiles-and-accessories-chargers-and-cables",
  motorcycle: "bike-accessories-riding-gear",
  "skin-care": "skin-care-moisturisers",
  smartphones: "mobiles-and-accessories-smartphones",
  "sports-accessories": "team-sports-cricket",
  sunglasses: "accessories-sunglasses",
  tablets: "mobiles-and-accessories-smartphones",
  tops: "western-wear-tops-and-tees",
  vehicle: "car-accessories-car-covers",
  "womens-bags": "handbags-and-clutches-handbags",
  "womens-dresses": "western-wear-dresses",
  "womens-jewellery": "jewellery-necklaces-and-sets",
  "womens-shoes": "footwear-flats-and-bellies",
  "womens-watches": "accessories-watches",
};

const VARIANTS = [
  { suffix: "", priceMul: 1 },
  { suffix: " (Pack of 2)", priceMul: 1.85 },
  { suffix: " — Premium Edition", priceMul: 1.4 },
  { suffix: " — Value Pack", priceMul: 2.6 },
];

async function fetchDummyJson() {
  const res = await fetch(
    "https://dummyjson.com/products?limit=200&select=title,description,category,price,brand,rating,images,thumbnail"
  );
  if (!res.ok) throw new Error(`DummyJSON fetch failed: ${res.status}`);
  const { products } = await res.json();
  return products;
}

async function seedProducts(db, ownerIds) {
  const { rows: [{ n: existing }] } = await db.query("select count(*)::int as n from products");
  if (existing > 100 && !FORCE) {
    console.log(`[seed] products already seeded (${existing}) — skipping (use --force)`);
    return;
  }
  if (FORCE) await db.query("delete from products where sku like 'MRD-%'");

  console.log("[seed] fetching DummyJSON dataset...");
  const source = await fetchDummyJson();

  const { rows: catRows } = await db.query("select id, slug from categories where level = 2");
  const catBySlug = Object.fromEntries(catRows.map((r) => [r.slug, r.id]));
  const fallbackCat = catRows[0].id;

  const STATUS_POOL = [
    ...Array(85).fill("live"), ...Array(8).fill("review"),
    ...Array(4).fill("draft"), ...Array(3).fill("archived"),
  ];

  const values = [];
  let skuSeq = 1000;
  for (const p of source) {
    const catId = catBySlug[DJ_CATEGORY_MAP[p.category]] ?? fallbackCat;
    for (const v of VARIANTS) {
      const name = `${p.title}${v.suffix}`;
      const priceInr = Math.max(49, Math.round(p.price * 83 * v.priceMul) - 1);
      const mrp = Math.round(priceInr * (1 + randInt(8, 35) / 100));
      values.push([
        pick(ownerIds), catId, name.slice(0, 180), slugify(name), p.brand || "Generic",
        (p.description || "").slice(0, 4900), priceInr, mrp, randInt(0, 2500),
        `MRD-${skuSeq++}`, pick(STATUS_POOL),
        `{${[p.thumbnail, ...(p.images || [])].filter(Boolean).slice(0, 4).map((u) => `"${u}"`).join(",")}}`,
        Math.min(5, Math.max(0, p.rating || 4)).toFixed(1),
      ]);
    }
  }

  console.log(`[seed] inserting ${values.length} products...`);
  const COLS = 13;
  for (let i = 0; i < values.length; i += 200) {
    const batch = values.slice(i, i + 200);
    const params = batch.flat();
    const placeholders = batch
      .map((_, r) => `(${Array.from({ length: COLS }, (_, c) => `$${r * COLS + c + 1}`).join(",")})`)
      .join(",");
    await db.query(
      `insert into products (owner_id, category_id, name, slug, brand, description,
                             price, mrp, stock, sku, status, images, rating)
       values ${placeholders}
       on conflict (sku) do nothing`,
      params
    );
  }
  const { rows: [{ n }] } = await db.query("select count(*)::int as n from products");
  console.log(`[seed] products done — ${n} total`);
}

// ---------------------------------------------------------- orders
const CUSTOMERS = [
  "Rohan Gupta","Sneha Iyer","Vikram Singh","Ananya Reddy","Kabir Mehta","Pooja Nair",
  "Arjun Joshi","Divya Menon","Sameer Khan","Lakshmi Pillai","Rahul Verma","Nisha Agarwal",
  "Aditya Rao","Kavita Desai","Manish Tiwari","Ritu Chauhan","Suresh Patil","Meera Kulkarni",
  "Harpreet Kaur","Farhan Sheikh","Ganesh Yadav","Swati Bhatt","Nikhil Saxena","Tanvi Shah",
  "Deepak Mishra","Anjali Dubey","Rajesh Kumar","Shruti Bansal","Amit Trivedi","Priyanka Ghosh",
];
const CITIES = [
  ["Mumbai","Maharashtra"],["Delhi","Delhi"],["Bengaluru","Karnataka"],["Hyderabad","Telangana"],
  ["Chennai","Tamil Nadu"],["Kolkata","West Bengal"],["Pune","Maharashtra"],["Ahmedabad","Gujarat"],
  ["Jaipur","Rajasthan"],["Lucknow","Uttar Pradesh"],["Surat","Gujarat"],["Kanpur","Uttar Pradesh"],
  ["Nagpur","Maharashtra"],["Indore","Madhya Pradesh"],["Bhopal","Madhya Pradesh"],["Patna","Bihar"],
  ["Vadodara","Gujarat"],["Coimbatore","Tamil Nadu"],["Kochi","Kerala"],["Guwahati","Assam"],
  ["Chandigarh","Chandigarh"],["Mysuru","Karnataka"],["Varanasi","Uttar Pradesh"],["Amritsar","Punjab"],
];
const OFFICERS = [
  "Ravi Deshmukh","Priya Sharma","Sunil Jadhav","Asha Gowda","Imran Qureshi","Neha Kkohli",
  "Prakash Rathod","Geeta Solanki","Mohit Chandel","Rekha Naik","Vijay Pawar","Sarita Devi",
];
const ORDER_STATUS_POOL = [
  ...Array(55).fill("delivered"), ...Array(15).fill("in-transit"), ...Array(12).fill("processing"),
  ...Array(8).fill("packed"), ...Array(6).fill("returned"), ...Array(4).fill("cancelled"),
];

async function seedOrders(db) {
  const { rows: [{ n: existing }] } = await db.query("select count(*)::int as n from orders");
  if (existing > 100 && !FORCE) {
    console.log(`[seed] orders already seeded (${existing}) — skipping (use --force)`);
    return;
  }
  if (FORCE) await db.query("delete from orders where order_no like 'ORD-%'");

  const { rows: products } = await db.query(
    "select id, owner_id, name, price from products where status = 'live'"
  );
  if (!products.length) throw new Error("No live products to attach orders to");

  const TOTAL = 2600;
  console.log(`[seed] inserting ${TOTAL} orders...`);
  const now = Date.now();
  const values = [];
  for (let i = 0; i < TOTAL; i++) {
    const p = pick(products);
    const qty = pick([1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6]);
    const isField = rand() < 0.45;
    const [city, state] = pick(CITIES);
    const placedAt = new Date(now - randInt(0, 180 * 24 * 60) * 60 * 1000);
    values.push([
      `ORD-${placedAt.getFullYear()}${String(100000 + i)}`,
      p.owner_id, p.id, p.name, pick(CUSTOMERS), city, state,
      isField ? "field" : "online", isField ? pick(OFFICERS) : null,
      qty, p.price, (qty * Number(p.price)).toFixed(2),
      pick(ORDER_STATUS_POOL), placedAt.toISOString(),
    ]);
  }

  const COLS = 14;
  for (let i = 0; i < values.length; i += 200) {
    const batch = values.slice(i, i + 200);
    const params = batch.flat();
    const placeholders = batch
      .map((_, r) => `(${Array.from({ length: COLS }, (_, c) => `$${r * COLS + c + 1}`).join(",")})`)
      .join(",");
    await db.query(
      `insert into orders (order_no, client_id, product_id, product_name, customer_name,
                           city, state, channel, officer_name, qty, unit_price, amount, status, placed_at)
       values ${placeholders}
       on conflict (order_no) do nothing`,
      params
    );
  }
  const { rows: [{ n }] } = await db.query("select count(*)::int as n from orders");
  console.log(`[seed] orders done — ${n} total`);
}

// ---------------------------------------------------------- main
(async () => {
  const db = await connect();
  try {
    console.log("[seed] applying schema...");
    await db.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

    // Product owners = every confirmed user with the client role
    const { rows: owners } = await db.query(
      `select id from auth.users
       where coalesce(raw_user_meta_data->>'role', 'client') = 'client'
         and email_confirmed_at is not null`
    );
    if (!owners.length) throw new Error("No client users found — sign up at least one client first");
    console.log(`[seed] ${owners.length} client owners found`);

    await seedCategories(db);
    await seedProducts(db, owners.map((o) => o.id));
    await seedOrders(db);
    console.log("[seed] ALL DONE");
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error("[seed] FATAL:", e.message);
  process.exit(1);
});
