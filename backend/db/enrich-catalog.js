#!/usr/bin/env node
/**
 * Recruweb Sales Portal — catalog restore & enrichment
 *
 * Restores the "real product" catalog quality without destroying history:
 *   1. Re-brands every product still tagged "Generic" with a realistic,
 *      name-aware brand (Nescafé for coffee, Amul for milk, SG for cricket,
 *      Prestige for cookware, Yonex for rackets, ...). Deterministic, so
 *      re-runs converge to the same result.
 *   2. Removes known junk/test rows (explicit SKU deny-list — nothing is
 *      matched by fuzzy heuristics, so real vendor data is never touched).
 *   3. Inserts a curated set of flagship products. Every image URL is
 *      verified live (HTTP 200 + image content-type) BEFORE insert; any
 *      product whose images fail verification is skipped and reported.
 *
 * Existing seeded products are NEVER deleted: orders.product_id references
 * them (ON DELETE SET NULL) and 2,600 historical orders would lose their
 * product linkage.
 *
 * Usage:  node db/enrich-catalog.js            (dry run — prints the plan)
 *         node db/enrich-catalog.js --apply    (executes inside a transaction)
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const PROJECT_ID = process.env.SUPABASE_PROJECT_ID || "";
const DB_PASSWORD = process.env.SUPABASE_DATABASE_PASSWORD;

// Junk/test rows to remove — explicit deny-list only.
const JUNK_SKUS = ["MRD-MRT24BPSBS"]; // "cake" / "venila" test entry

// ---------------------------------------------------------------- connection
function candidateUrls() {
  const urls = [];
  if (process.env.SUPABASE_DB_URL) urls.push(process.env.SUPABASE_DB_URL);
  if (process.env.SUPABASE_URL && process.env.SUPABASE_URL.startsWith("postgres")) {
    urls.push(process.env.SUPABASE_URL);
  }
  if (DB_PASSWORD && PROJECT_ID) {
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
      statement_timeout: 60000,
    });
    try {
      await client.connect();
      console.log(`[enrich] connected via ${new URL(url.replace("postgresql://", "http://")).hostname}`);
      return client;
    } catch (e) {
      lastErr = e;
      console.log(`[enrich] connection failed (${String(e.message).slice(0, 60)}), trying next...`);
      try { await client.end(); } catch {}
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- utilities
const slugify = (s) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Deterministic hash → stable brand assignment across re-runs
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
const stablePick = (arr, key) => arr[hashStr(key) % arr.length];

// ---------------------------------------------------------------- brand map
// Keyword rules run first (most specific wins); category pools are fallback.
const KEYWORD_BRANDS = [
  [/nescafe|coffee/i, "Nescafé"],
  [/\bmilk\b/i, "Amul"],
  [/ice cream/i, "Amul"],
  [/\bhoney\b/i, "Dabur"],
  [/\brice\b/i, "India Gate"],
  [/cooking oil/i, "Fortune"],
  [/\bjuice\b/i, "Real"],
  [/soft drink/i, "Thums Up"],
  [/\bwater\b/i, "Bisleri"],
  [/protein powder/i, "MuscleBlaze"],
  [/\beggs?\b/i, "Farm Made"],
  [/dog food|cat food/i, "Pedigree"],
  [/tissue/i, "Origami"],
  [/beef|chicken|fish steak|meat/i, "Licious"],
  [/apple\b|kiwi|lemon|strawberry|mulberry|cucumber|potato|onion|pepper/i, "Farm Fresh"],
  [/cricket/i, "SG"],
  [/tennis/i, "Yonex"],
  [/shuttlecock|badminton/i, "Yonex"],
  [/football|volleyball/i, "Nivia"],
  [/basketball/i, "Cosco"],
  [/baseball/i, "Wilson"],
  [/golf/i, "Callaway"],
  [/microwave|blender|electric stove|hand blender/i, "Philips"],
  [/knife|chopping|peeler|grater|slicer|whisk|tongs|turner|sieve|strainer|squeezer/i, "Pigeon"],
  [/wok|pan\b|pot\b|cooker/i, "Prestige"],
  [/lunch box|bottle|tray|container|ice cube/i, "Milton"],
  [/glass|plate|mug|cup\b|spoon|fork\b/i, "Borosil"],
  [/spice rack|rolling pin|spatula|stand\b/i, "Wonderchef"],
  [/lamp|photo frame|plant|swing|showpiece|decor/i, "Home Centre"],
  [/gown|dress|frock|skirt|corset|suit\b/i, "Biba"],
  [/top\b|tee\b|blouse/i, "Vero Moda"],
  [/earring|necklace|jewell?ery|crystal/i, "Zaveri Pearls"],
];

const CATEGORY_BRAND_POOLS = {
  "kitchen-tools-knives-and-choppers": ["Prestige", "Pigeon", "Milton", "Borosil", "Cello", "Wonderchef"],
  "packaged-food-ready-to-eat": ["Tata Sampann", "ITC Master Chef", "MTR", "Haldiram's"],
  "team-sports-cricket": ["SG", "SS", "Cosco", "Nivia"],
  "home-decor-wall-decor": ["Home Centre", "Chumbak", "ExclusiveLane"],
  "western-wear-dresses": ["Biba", "W for Woman", "AND", "ONLY"],
  "western-wear-tops-and-tees": ["Vero Moda", "ONLY", "AND", "Harpa"],
  "jewellery-necklaces-and-sets": ["Zaveri Pearls", "Accessorize", "Voylla"],
};
const DEFAULT_POOL = ["Recruweb Select", "Solimo", "Amazon Basics"];

function brandFor(name, categorySlug) {
  for (const [re, brand] of KEYWORD_BRANDS) if (re.test(name)) return brand;
  const pool = CATEGORY_BRAND_POOLS[categorySlug] || DEFAULT_POOL;
  return stablePick(pool, name.replace(/\s*(\(Pack of 2\)|— Premium Edition|— Value Pack)\s*$/i, ""));
}

// ---------------------------------------------------------------- curated products
// Flagship, real-market products. Images are verified live before insert.
const U = (id) => `https://images.unsplash.com/${id}?w=1080&q=80&auto=format&fit=crop`;
const CURATED = [
  { name: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones", brand: "Sony", cat: "audio-bluetooth-headphones", price: 26989, mrp: 34990, rating: 4.7, desc: "Industry-leading noise cancellation with two processors and eight microphones. Up to 30-hour battery life, crystal-clear hands-free calling and multipoint connection.", img: U("photo-1505740420928-5e560c06d30e") },
  { name: "Apple MacBook Air 13\u2033 M3 (8GB/256GB)", brand: "Apple", cat: "computers-laptops", price: 99900, mrp: 114900, rating: 4.8, desc: "Strikingly thin design with the M3 chip, up to 18 hours of battery life, a brilliant Liquid Retina display and a fanless, silent design.", img: U("photo-1517336714731-489689fd1ca8") },
  { name: "boAt Airdopes 141 TWS Earbuds", brand: "boAt", cat: "audio-earphones", price: 1099, mrp: 4490, rating: 4.2, desc: "42 hours of playback, ENx noise-cancelling mics, low-latency Beast Mode for gaming and ASAP charge — 5 minutes gives 75 minutes of play.", img: U("photo-1590658268037-6bf12165a8df") },
  { name: "Noise ColorFit Pro 4 Smart Watch", brand: "Noise", cat: "wearables-smart-watches", price: 2799, mrp: 5999, rating: 4.3, desc: "1.72\u2033 TruView display, Bluetooth calling, 100+ sport modes, SpO2 and heart-rate tracking with 7-day battery life.", img: U("photo-1546868871-7041f2a55e12") },
  { name: "Nike Air Max 270 Running Shoes", brand: "Nike", cat: "footwear-casual-shoes", price: 12795, mrp: 14995, rating: 4.5, desc: "Nike's biggest heel Air unit yet delivers all-day comfort with a breathable engineered mesh upper and foam midsole.", img: U("photo-1542291026-7eec264c27ff") },
  { name: "Ray-Ban Aviator Classic Sunglasses", brand: "Ray-Ban", cat: "accessories-sunglasses", price: 7690, mrp: 8990, rating: 4.6, desc: "The timeless aviator with crystal green G-15 lenses and gold-tone metal frame. 100% UV protection.", img: U("photo-1572635196237-14b3f281503f") },
  { name: "Casio G-Shock GA-2100 Analog-Digital Watch", brand: "Casio", cat: "accessories-watches", price: 9995, mrp: 11495, rating: 4.6, desc: "Carbon Core Guard case, 200m water resistance and shock resistance in the iconic ultra-slim octagonal design.", img: U("photo-1523275335684-37898b6baf30") },
  { name: "Fjällräven Kånken Classic Backpack", brand: "Fjällräven", cat: "luggage-backpacks", price: 6999, mrp: 7999, rating: 4.5, desc: "The iconic Swedish backpack in durable Vinylon F fabric — water resistant, 16L capacity with a removable seat pad.", img: U("photo-1553062407-98eeb64c6a62") },
  { name: "Philips HL7756/00 750W Mixer Grinder", brand: "Philips", cat: "small-appliances-mixer-grinders", price: 3599, mrp: 5195, rating: 4.4, desc: "750W turbo motor with 3 leak-proof stainless-steel jars, advanced ventilation for longer motor life and 5-year motor warranty.", img: U("photo-1570222094114-d054a817e56b") },
  { name: "Prestige Svachh 5L Pressure Cooker", brand: "Prestige", cat: "cookware-pressure-cookers", price: 2145, mrp: 2795, rating: 4.5, desc: "Unique deep-lid spillage control, food-grade aluminium body, works on gas and induction. 5-year warranty.", img: U("photo-1585515320310-259814833e62") },
  { name: "Tata Tea Gold 1kg Pack", brand: "Tata Tea", cat: "snacks-and-beverages-tea", price: 545, mrp: 620, rating: 4.5, desc: "A special blend of fine Assam tea with 15% gently rolled aromatic long leaves for a rich taste and irresistible aroma.", img: U("photo-1594631252845-29fc4cc8cde9") },
  { name: "Nescafé Gold Blend Instant Coffee 200g Jar", brand: "Nescafé", cat: "snacks-and-beverages-coffee", price: 615, mrp: 745, rating: 4.4, desc: "Signature smooth, well-rounded taste crafted from Arabica and Robusta beans, roasted to golden perfection.", img: U("photo-1509042239860-f550ce710b93") },
  { name: "Amul Pure Ghee 1L Tin", brand: "Amul", cat: "cooking-essentials-ghee", price: 615, mrp: 650, rating: 4.7, desc: "Made from fresh cream with the rich aroma and granular texture of traditional ghee. An everyday source of energy and vitamins.", img: U("photo-1631452180519-c014fe946bc7") },
  { name: "Dabur Organic Honey 500g Squeezy Pack", brand: "Dabur", cat: "dry-fruits-and-sweets-honey-and-spreads", price: 399, mrp: 545, rating: 4.4, desc: "100% pure, NPOP-certified organic honey with no added sugar — passes 100+ purity tests including NMR.", img: U("photo-1587049352846-4a222e784d38") },
  { name: "Mamaearth Vitamin C Face Wash 100ml", brand: "Mamaearth", cat: "skin-care-face-wash", price: 249, mrp: 349, rating: 4.2, desc: "Brightening face wash with Vitamin C and turmeric. Dermatologically tested, free of sulphates and parabens.", img: U("photo-1556228720-195a672e8a03") },
  { name: "Forest Essentials Nargis Body Mist 100ml", brand: "Forest Essentials", cat: "fragrances-body-mists", price: 1975, mrp: 2175, rating: 4.5, desc: "A luxurious Ayurvedic body mist with the heady floral notes of fresh Nargis flowers from the Himalayan valleys.", img: U("photo-1541643600914-78b084683601") },
  { name: "Milton Thermosteel Flip Lid 1L Flask", brand: "Milton", cat: "kitchen-storage-water-bottles", price: 899, mrp: 1345, rating: 4.4, desc: "Double-walled vacuum insulation keeps beverages hot or cold for 24 hours. Rust-proof 18/8 stainless steel.", img: U("photo-1602143407151-7111542de6e8") },
  { name: "Wildcraft 44L Rucksack for Trekking", brand: "Wildcraft", cat: "luggage-backpacks", price: 2699, mrp: 3999, rating: 4.3, desc: "Ergonomic padded shoulder straps, ventilated back system and rain cover — built for the Indian outdoors.", img: U("photo-1622260614153-03223fb72052") },
  { name: "JBL Flip 6 Portable Bluetooth Speaker", brand: "JBL", cat: "audio-bluetooth-speakers", price: 9999, mrp: 11999, rating: 4.6, desc: "Bold JBL Original Pro Sound with 12 hours of playtime, IP67 waterproof and dustproof, and PartyBoost pairing.", img: U("photo-1608043152269-423dbba4e7e1") },
  { name: "Samsung Galaxy S24 5G (8GB/256GB)", brand: "Samsung", cat: "mobiles-and-accessories-smartphones", price: 62999, mrp: 79999, rating: 4.6, desc: "Galaxy AI is here — Circle to Search, Live Translate and a pro-grade 50MP camera in a 6.2\u2033 Dynamic AMOLED 2X display.", img: U("photo-1610945265064-0e34e5519bbf") },
];

// ---------------------------------------------------------------- image verify
async function verifyImage(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { method: "GET", signal: ctrl.signal, headers: { Range: "bytes=0-0", "User-Agent": "recruweb-enrich/1.0" } });
    clearTimeout(timer);
    const type = res.headers.get("content-type") || "";
    return (res.status === 200 || res.status === 206) && type.startsWith("image/");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- main
(async () => {
  const db = await connect();
  try {
    // ---- preflight: schema sanity ----
    const { rows: cols } = await db.query(
      "select column_name from information_schema.columns where table_name = 'products'"
    );
    const have = new Set(cols.map((r) => r.column_name));
    for (const required of ["id", "owner_id", "category_id", "name", "slug", "brand", "price", "mrp", "sku", "status", "images", "rating"]) {
      if (!have.has(required)) throw new Error(`products.${required} missing — schema mismatch, aborting`);
    }

    // ---- plan: re-brand Generic ----
    const { rows: generics } = await db.query(`
      select p.id, p.name, c.slug as cat_slug
      from products p left join categories c on c.id = p.category_id
      where p.brand = 'Generic'`);
    const rebrand = generics.map((g) => ({ id: g.id, name: g.name, brand: brandFor(g.name, g.cat_slug || "") }));
    console.log(`[enrich] ${rebrand.length} products to re-brand from "Generic"`);

    // ---- plan: junk removal (deny-list only) ----
    const { rows: junk } = await db.query(
      "select id, name, sku from products where sku = any($1)", [JUNK_SKUS]
    );
    console.log(`[enrich] ${junk.length} junk row(s) matched deny-list:`, junk.map((j) => `${j.name} (${j.sku})`).join(", ") || "none");

    // ---- plan: curated inserts ----
    const { rows: catRows } = await db.query("select id, slug from categories where level = 2");
    const catBySlug = Object.fromEntries(catRows.map((r) => [r.slug, r.id]));
    const { rows: owners } = await db.query(`
      select owner_id from products where sku ~ '^MRD-[0-9]+$'
      group by owner_id order by count(*) desc`);
    if (!owners.length) throw new Error("No seed product owners found — run db/seed.js first");
    const ownerIds = owners.map((o) => o.owner_id);

    const { rows: existingSkus } = await db.query(
      "select sku from products where sku like 'MRD-9%'"
    );
    const skuTaken = new Set(existingSkus.map((r) => r.sku));

    const inserts = [];
    const skipped = [];
    let skuSeq = 9000;
    for (const p of CURATED) {
      const sku = `MRD-${skuSeq++}`;
      if (skuTaken.has(sku)) { skipped.push(`${p.name} — already inserted (${sku})`); continue; }
      const catId = catBySlug[p.cat];
      if (!catId) { skipped.push(`${p.name} — category slug "${p.cat}" not found`); continue; }
      if (!(await verifyImage(p.img))) { skipped.push(`${p.name} — image failed verification`); continue; }
      inserts.push({ ...p, sku, catId, owner: stablePick(ownerIds, p.name) });
    }
    console.log(`[enrich] ${inserts.length} curated products ready, ${skipped.length} skipped`);
    for (const s of skipped) console.log(`  [skip] ${s}`);

    if (!APPLY) {
      console.log("\n[enrich] DRY RUN — nothing written. Re-run with --apply to execute.");
      console.log("  sample re-brands:", rebrand.slice(0, 8).map((r) => `"${r.name}" → ${r.brand}`).join("; "));
      return;
    }

    // ---- apply, atomically ----
    await db.query("begin");
    try {
      let rebranded = 0;
      for (let i = 0; i < rebrand.length; i += 100) {
        const batch = rebrand.slice(i, i + 100);
        const { rowCount } = await db.query(
          `update products p set brand = v.brand, updated_at = now()
           from (select unnest($1::uuid[]) as id, unnest($2::text[]) as brand) v
           where p.id = v.id and p.brand = 'Generic'`,
          [batch.map((b) => b.id), batch.map((b) => b.brand)]
        );
        rebranded += rowCount;
      }

      const { rowCount: junkDeleted } = await db.query(
        "delete from products where sku = any($1)", [JUNK_SKUS]
      );

      let inserted = 0;
      for (const p of inserts) {
        const slug = slugify(p.name);
        const { rowCount } = await db.query(
          `insert into products (owner_id, category_id, name, slug, brand, description,
                                 price, mrp, stock, sku, status, images, rating)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'live',$11,$12)
           on conflict do nothing`,
          [p.owner, p.catId, p.name, slug, p.brand, p.desc, p.price, p.mrp,
           50 + (hashStr(p.name) % 450), p.sku, [p.img], p.rating]
        );
        inserted += rowCount;
      }

      await db.query("commit");
      console.log(`[enrich] APPLIED — re-branded ${rebranded}, removed ${junkDeleted} junk row(s), inserted ${inserted} curated products`);
    } catch (e) {
      await db.query("rollback");
      throw e;
    }

    // ---- verification report ----
    const { rows: [report] } = await db.query(`
      select (select count(*)::int from products) as total,
             (select count(*)::int from products where brand = 'Generic') as generic_left,
             (select count(*)::int from products where sku like 'MRD-9%') as curated,
             (select count(*)::int from products where status = 'live') as live`);
    console.log("[enrich] verification:", JSON.stringify(report));
    if (report.generic_left > 0) console.warn(`[enrich] WARNING: ${report.generic_left} products still "Generic"`);
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error("[enrich] FAILED:", e.message);
  process.exit(1);
});
