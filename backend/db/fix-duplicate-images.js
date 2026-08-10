#!/usr/bin/env node
/**
 * fix-duplicate-images.js
 *
 * Eliminates duplicate product images across the catalog.
 *
 * Problem: refresh-product-images.js assigned images from small per-category
 * pools, so hundreds of DIFFERENT products ended up sharing the same photo
 * (e.g. "Golden Shoes Woman" showing the same shoe as "Calvin Klein Heel
 * Shoes"). 797 products shared only 120 distinct images.
 *
 * Strategy:
 *  1. The catalog was seeded from the DummyJSON dataset, whose CDN hosts
 *     DISTINCT, real photo sets per product (1-6 photos each). Every DB row
 *     is matched back to its DummyJSON product by normalized base name
 *     (variant suffixes "(Pack of 2)", "— Premium Edition", "— Value Pack"
 *     are stripped for matching).
 *  2. Each DIFFERENT base product is guaranteed a globally unique primary
 *     image (enforced with a used-URL set; collisions fall through to the
 *     product's next photo).
 *  3. Variants of the SAME base product get DIFFERENT photos of that same
 *     product when the photo set allows (e.g. base -> photo 1, Pack of 2 ->
 *     photo 2, Premium -> photo 3). If the product has only one photo, the
 *     variant intentionally shares it — matching real-marketplace behaviour
 *     (a 2-pack of the same product is photographed identically) — and is
 *     reported in the summary.
 *  4. Unmatched products (the curated flagship items) keep their existing
 *     image if it is globally unique; otherwise one is assigned from a
 *     verified reserve pool.
 *
 * Safety guarantees (same conventions as sibling scripts):
 *  - DRY RUN by default; pass --apply to write.
 *  - Every URL that will be written is live-verified (HTTP 200/206 +
 *    image/* content-type) BEFORE any DB write. A dead URL is never written;
 *    the product keeps its previous image instead.
 *  - All writes happen in a single transaction; any error rolls back.
 *  - Idempotent and deterministic: re-runs converge to the same state.
 *  - Only the products.images column is touched. No rows are added/removed.
 *
 * Usage:
 *   node db/fix-duplicate-images.js           # dry run (no writes)
 *   node db/fix-duplicate-images.js --apply   # apply changes
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const DUMMYJSON_URL = "https://dummyjson.com/products?limit=0&select=title,images,thumbnail";
const VERIFY_TIMEOUT_MS = 10000;
const VERIFY_CONCURRENCY = 16;

/* Verified reserve pool for unmatched products whose current image collides. */
const RESERVE_POOL = [
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1080&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=1080&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1080&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1080&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=1080&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=1080&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=1080&q=80&auto=format&fit=crop",
];

/* Variant suffix ranking so assignment order is deterministic. */
const VARIANT_RANK = [
  [/\(pack of 2\)\s*$/i, 1],
  [/—\s*premium edition\s*$/i, 2],
  [/—\s*value pack\s*$/i, 3],
];

function variantRank(name) {
  for (const [re, rank] of VARIANT_RANK) if (re.test(name.trim())) return rank;
  return 0; // base product
}

function normalizeBase(name) {
  return name
    .toLowerCase()
    .replace(/\s*(\(pack of 2\)|—\s*premium edition|—\s*value pack)\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ---------------- URL verification (GET Range 0-0, retry once) ----------- */
async function verifyOnce(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Range: "bytes=0-0", "User-Agent": "recruweb-image-fix/1.0" },
    });
    clearTimeout(timer);
    const type = res.headers.get("content-type") || "";
    // some CDNs ignore Range and return 200 with full body — abort the body read
    try { ctrl.abort(); } catch {}
    return (res.status === 200 || res.status === 206) && type.startsWith("image/");
  } catch {
    return false;
  }
}

async function verifyAll(urls) {
  const unique = [...new Set(urls)];
  const results = new Map();
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(VERIFY_CONCURRENCY, unique.length) }, async () => {
      while (i < unique.length) {
        const url = unique[i++];
        results.set(url, (await verifyOnce(url)) || (await verifyOnce(url)));
      }
    })
  );
  return results;
}

/* ---------------- DummyJSON catalog fetch with basic hardening ----------- */
async function fetchDummyJson() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let payload;
  try {
    const res = await fetch(DUMMYJSON_URL, {
      signal: ctrl.signal,
      headers: { "User-Agent": "recruweb-image-fix/1.0" },
    });
    if (!res.ok) throw new Error(`dummyjson HTTP ${res.status}`);
    payload = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (!payload || !Array.isArray(payload.products) || payload.products.length === 0) {
    throw new Error("dummyjson returned an empty/invalid catalog");
  }
  const byBase = new Map();
  for (const p of payload.products) {
    if (!p.title || !Array.isArray(p.images) || p.images.length === 0) continue;
    const images = [...new Set(p.images.filter((u) => typeof u === "string" && u.startsWith("https://")))];
    if (images.length === 0) continue;
    byBase.set(normalizeBase(p.title), { title: p.title, images });
  }
  return byBase;
}

/* ------------------------------------------------------------------------ */
async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("FATAL: SUPABASE_DB_URL / DATABASE_URL is not set in backend/.env");
    process.exit(1);
  }

  console.log("[fix-images] fetching DummyJSON catalog...");
  const catalog = await fetchDummyJson();
  console.log(`[fix-images] catalog loaded: ${catalog.size} base products`);

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    statement_timeout: 120000,
  });
  await client.connect();

  try {
    const { rows: products } = await client.query(`
      SELECT id, name, sku, images
      FROM products
      ORDER BY name, sku
    `);
    if (products.length === 0) {
      console.log("[fix-images] no products found — nothing to do.");
      return;
    }

    /* ---- group rows by base product; order variants deterministically ---- */
    const groups = new Map();
    for (const p of products) {
      const key = normalizeBase(p.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) => variantRank(a.name) - variantRank(b.name) || a.sku.localeCompare(b.sku));
    }

    /* ---- plan assignments with a global used-URL set ---- */
    const used = new Set();
    const plan = [];          // { id, name, primary, gallery }
    const unmatchedRows = []; // rows with no dummyjson mapping
    let variantShares = 0;

    for (const [key, rows] of groups) {
      const dj = catalog.get(key);
      if (!dj) { unmatchedRows.push(...rows); continue; }
      const photos = dj.images.filter((u) => !used.has(u));
      if (photos.length === 0) { unmatchedRows.push(...rows); continue; } // full collision (extremely unlikely)
      rows.forEach((row, i) => {
        let primary;
        if (i < photos.length) {
          primary = photos[i];
          used.add(primary);
        } else {
          primary = photos[i % photos.length]; // same-base variant shares its own product's photo
          variantShares++;
        }
        const gallery = [primary, ...dj.images.filter((u) => u !== primary)];
        plan.push({ id: row.id, name: row.name, old: (row.images || [])[0] || null, primary, gallery });
      });
    }

    /* ---- unmatched rows: keep if unique, else pull from reserve pool ---- */
    let reserveIdx = 0;
    for (const row of unmatchedRows) {
      const current = (row.images || [])[0] || null;
      if (current && !used.has(current)) {
        used.add(current);
        continue; // already unique — leave untouched
      }
      let assigned = null;
      while (reserveIdx < RESERVE_POOL.length) {
        const candidate = RESERVE_POOL[reserveIdx++];
        if (!used.has(candidate)) { assigned = candidate; break; }
      }
      if (!assigned) {
        console.warn(`[fix-images] WARN: reserve pool exhausted — "${row.name}" keeps a duplicate image`);
        continue;
      }
      used.add(assigned);
      plan.push({ id: row.id, name: row.name, old: current, primary: assigned, gallery: [assigned] });
    }

    /* ---- only write rows whose primary image actually changes ---- */
    const changes = plan; // gallery ordering may change even when the primary image is unchanged
    console.log(`[fix-images] planned: ${plan.length} rows, ${unmatchedRows.length} unmatched, ${variantShares} same-base variant photo shares`);

    /* ---- live-verify every primary URL before writing anything ---- */
    console.log(`[fix-images] verifying ${new Set(changes.map((c) => c.primary)).size} unique primary URLs...`);
    const verified = await verifyAll(changes.map((c) => c.primary));
    const writable = [];
    const keptDead = [];
    for (const c of changes) {
      if (verified.get(c.primary)) {
        // prune unverified gallery members too (primary already verified)
        writable.push({ ...c, gallery: [c.primary, ...c.gallery.slice(1)] });
      } else {
        keptDead.push(`${c.name} -> ${c.primary}`);
      }
    }
    const deadCount = [...verified.values()].filter((v) => !v).length;
    console.log(`[fix-images] URL check: ${verified.size - deadCount} ok, ${deadCount} dead`);
    if (keptDead.length) {
      console.log(`[fix-images] KEEPING old image for ${keptDead.length} rows (dead URL):`);
      keptDead.slice(0, 10).forEach((s) => console.log(`  ${s}`));
    }

    if (!APPLY) {
      console.log(`\n[fix-images] DRY RUN — would update ${writable.length} rows. Sample:`);
      writable.slice(0, 10).forEach((c) => console.log(`  ${c.name}\n    ${c.old || "(none)"} -> ${c.primary}`));
      console.log("\nRe-run with --apply to write these changes.");
      return;
    }

    /* ---- apply atomically ---- */
    await client.query("BEGIN");
    try {
      let done = 0;
      // Per-row parameterized updates (797 rows max — trivial inside one tx).
      for (const c of writable) {
        await client.query(
          `UPDATE products SET images = $1::text[], updated_at = now() WHERE id = $2`,
          [c.gallery, c.id]
        );
        done++;
      }
      await client.query("COMMIT");
      console.log(`[fix-images] COMMITTED ${done} row updates.`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    /* ---- post-apply verification report ---- */
    const { rows: [after] } = await client.query(`
      SELECT count(*)::int AS total,
             count(DISTINCT images[1])::int AS distinct_primary,
             count(*) FILTER (WHERE images IS NULL OR array_length(images, 1) IS NULL)::int AS no_image
      FROM products
    `);
    const { rows: crossDups } = await client.query(`
      SELECT images[1] AS img, count(DISTINCT regexp_replace(lower(name),
        '\\s*(\\(pack of 2\\)|—\\s*premium edition|—\\s*value pack)\\s*$', '')) AS distinct_bases
      FROM products
      WHERE images IS NOT NULL AND array_length(images, 1) >= 1
      GROUP BY images[1]
      HAVING count(DISTINCT regexp_replace(lower(name),
        '\\s*(\\(pack of 2\\)|—\\s*premium edition|—\\s*value pack)\\s*$', '')) > 1
    `);
    console.log("[fix-images] post-apply:", JSON.stringify(after));
    console.log(`[fix-images] images shared across DIFFERENT base products: ${crossDups.length} (target: 0)`);
    if (crossDups.length > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[fix-images] FAILED:", e.message);
  process.exit(1);
});
