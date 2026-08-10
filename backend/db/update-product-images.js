/**
 * Recruweb Sales Portal — swap placeholder image URLs for REAL product photos
 *
 * The real photos live in the Next.js app at frontend/public/products/<sku>.png
 * and are served by Next.js at /products/<sku>.png. This script points every
 * product's `images` column at its real local photo.
 *
 * Usage:   node db/update-product-images.js            (apply changes)
 *          node db/update-product-images.js --dry-run  (print plan, change nothing)
 *
 * Edge cases handled:
 *   - Idempotent: re-running produces the same end state.
 *   - Transactional: any failure rolls back everything.
 *   - Missing SKU: warns and continues; final summary reports skipped SKUs.
 *   - Non-destructive by default: only rows whose current image is still a
 *     placeholder (placehold.co / placeholder.svg / empty) are touched, so a
 *     photo you later upload by hand is never clobbered. Use --force to
 *     overwrite regardless.
 *   - Same connection fallback chain as db/seed.js.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require("pg");

const DRY_RUN = process.argv.includes("--dry-run");
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
      console.log(`[images] connected via ${host}`);
      return client;
    } catch (e) {
      lastErr = e;
      console.log(`[images] connection failed (${e.message.slice(0, 60)}), trying next...`);
      try { await client.end(); } catch {}
    }
  }
  throw lastErr;
}

/**
 * SKU -> real product photo served from frontend/public/products/.
 * File names are lowercase; SKUs in the DB are uppercase (MRD-XXXX).
 */
const IMAGE_MAP = {
  "MRD-1717": "/products/mrd-1717.png", // BIBA Red Polka Dot Fit & Flare Midi Dress
  "MRD-1684": "/products/mrd-1684.png", // Lavie Betula Tote — Navy Blue
  "MRD-1685": "/products/mrd-1685.png", // Caprese Kimmy Satchel — Royal Blue
  "MRD-1619": "/products/mrd-1619.png", // Ray-Ban Aviator Classic RB3025
  "MRD-9001": "/products/mrd-9001.png", // Apple iPhone 15 (128GB) Black
  "MRD-9002": "/products/mrd-9002.png", // Samsung Galaxy M35 5G
  "MRD-9003": "/products/mrd-9003.png", // boAt Airdopes 141
  "MRD-9004": "/products/mrd-9004.png", // Sony WH-CH520
  "MRD-9005": "/products/mrd-9005.png", // Noise ColorFit Pro 5
  "MRD-9006": "/products/mrd-9006.png", // Nike Revolution 7
  "MRD-9007": "/products/mrd-9007.png", // Titan Neo Splash
  "MRD-9008": "/products/mrd-9008.png", // Prestige Svachh 5L Pressure Cooker
  "MRD-9009": "/products/mrd-9009.png", // Philips HL7756 Mixer Grinder
  "MRD-9010": "/products/mrd-9010.png", // Milton Thermosteel 1L Flask
  "MRD-9011": "/products/mrd-9011.png", // HP 15s i5 Laptop
  "MRD-9012": "/products/mrd-9012.png", // Wildcraft Evo 44L Backpack
};

/** A current images value is "safe to replace" if it's empty or a placeholder. */
const PLACEHOLDER_RE = /placehold\.co|placeholder|^$/i;
const isPlaceholder = (images) =>
  !Array.isArray(images) || images.length === 0 || PLACEHOLDER_RE.test(images[0] || "");

(async () => {
  const db = await connect();
  try {
    const skus = Object.keys(IMAGE_MAP);
    const { rows } = await db.query(
      `select sku, name, images from products where sku = any($1::text[])`,
      [skus]
    );
    const bySku = Object.fromEntries(rows.map((r) => [r.sku, r]));

    const plan = [];
    const skipped = [];
    for (const sku of skus) {
      const row = bySku[sku];
      if (!row) { skipped.push(`${sku} (not found in DB)`); continue; }
      if (!FORCE && !isPlaceholder(row.images)) {
        skipped.push(`${sku} (already has a real image — use --force to overwrite)`);
        continue;
      }
      plan.push({ sku, name: row.name, url: IMAGE_MAP[sku] });
    }

    if (DRY_RUN) {
      console.log("[images] DRY RUN — no changes will be made\n");
      plan.forEach((p) => console.log(`  SET ${p.sku}  ->  ${p.url}   (${p.name})`));
      skipped.forEach((s) => console.log(`  SKIP ${s}`));
      return;
    }

    if (!plan.length) {
      console.log("[images] Nothing to update.");
      skipped.forEach((s) => console.log(`  SKIP ${s}`));
      return;
    }

    await db.query("begin");
    let updated = 0;
    for (const p of plan) {
      const { rowCount } = await db.query(
        `update products set images = array[$1]::text[] where sku = $2`,
        [p.url, p.sku]
      );
      updated += rowCount;
      console.log(`[images] ${p.sku} -> ${p.url}`);
    }
    await db.query("commit");

    console.log(`\n[images] DONE — ${updated} product image(s) updated`);
    skipped.forEach((s) => console.log(`  SKIP ${s}`));
  } catch (e) {
    try { await db.query("rollback"); } catch {}
    throw e;
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error("[images] FATAL:", e.message);
  process.exit(1);
});
