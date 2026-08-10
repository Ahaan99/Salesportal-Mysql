#!/usr/bin/env node
/**
 * refresh-product-images.js
 *
 * Replaces placeholder (cdn.dummyjson.com) product images with real,
 * live-verified product photography.
 *
 * Safety guarantees:
 *  - DRY RUN by default. Pass --apply to write.
 *  - Every candidate URL is verified live (HTTP 200 + image/* content-type)
 *    BEFORE any DB write. Unverifiable URLs are pruned.
 *  - If no verified image exists for a product, its existing image is KEPT.
 *    A dead URL is never written.
 *  - All writes happen inside a single transaction; any error rolls back.
 *  - Idempotent: only touches rows whose primary image is on dummyjson.
 *  - Deterministic: the same product type always maps to the same image.
 *
 * Usage:
 *   node db/refresh-product-images.js           # dry run (no writes)
 *   node db/refresh-product-images.js --apply   # apply changes
 */

"use strict";

require("dotenv").config({ quiet: true });
const { Client } = require("pg");
const https = require("https");

const APPLY = process.argv.includes("--apply");
const IMG_PARAMS = "auto=format&fit=crop&w=800&q=80";
const U = (id) => `https://images.unsplash.com/${id}?${IMG_PARAMS}`;

/* ------------------------------------------------------------------ */
/* Per-product overrides: iconic items get an exact-match real photo.  */
/* Keyed by the dummyjson slug embedded in the current image URL.      */
/* ------------------------------------------------------------------ */
const SLUG_OVERRIDES = {
  // smartphones
  "iphone-13-pro": U("photo-1632661674596-df8be070a5c5"),
  "iphone-x": U("photo-1592750475338-74b7b21085ab"),
  "iphone-6": U("photo-1510557880182-3d4d3cba35a5"),
  "iphone-5s": U("photo-1591337676887-a217a6970a8a"),
  "samsung-galaxy-s10": U("photo-1610945265064-0e34e5519bbf"),
  "samsung-galaxy-s8": U("photo-1565849904461-04a58ad377e0"),
  "samsung-galaxy-s7": U("photo-1511707171634-5f897ff02aa9"),
  // laptops
  "apple-macbook-pro-14-inch-space-grey": U("photo-1517336714731-489689fd1ca8"),
  "new-dell-xps-13-9300-laptop": U("photo-1593642632823-8f785ba67e45"),
  "huawei-matebook-x-pro": U("photo-1496181133206-80ce9b88a853"),
  "lenovo-yoga-920": U("photo-1611186871348-b1ce696e52c9"),
  "asus-zenbook-pro-dual-screen-laptop": U("photo-1588872657578-7efd1f1555ed"),
  // mobile accessories
  "apple-airpods": U("photo-1572569511254-d8f925fe2cbb"),
  "apple-airpods-max-silver": U("photo-1613040809024-b4ef7ba99bc3"),
  "apple-watch-series-4-gold": U("photo-1551816230-ef5deaed4a26"),
  "amazon-echo-plus": U("photo-1512446816042-444d641267d4"),
  "beats-flex-wireless-earphones": U("photo-1583394838336-acd977736f90"),
  // watches
  "rolex-submariner-watch": U("photo-1587836374828-4dbafa94cf0e"),
  "rolex-datejust": U("photo-1523170335258-f5ed11844a49"),
  "longines-master-collection": U("photo-1524592094714-0f0654e20314"),
  // shoes
  "nike-air-jordan-1-red-and-black": U("photo-1552346154-21d32810aba3"),
  "sports-sneakers-off-white-red": U("photo-1542291026-7eec264c27ff"),
  "sports-sneakers-off-white-&-red": U("photo-1600185365483-26d7a4cc7519"),
  "puma-future-rider-trainers": U("photo-1608231387042-66d1773070a5"),
  // groceries
  apple: U("photo-1560806887-1e4cd0b6cbd6"),
  eggs: U("photo-1506976785307-8732e854ad03"),
  milk: U("photo-1550583724-b2692b85b150"),
  lemon: U("photo-1590502593747-42a996133562"),
  strawberry: U("photo-1464965911861-746a04b4bca6"),
  kiwi: U("photo-1585059895524-72359e06133a"),
  potatoes: U("photo-1518977676601-b53f82aba655"),
  rice: U("photo-1586201375761-83865001e31c"),
  "honey-jar": U("photo-1587049352846-4a222e784d38"),
  "nescafe-coffee": U("photo-1559056199-641a0ac8b55e"),
  "ice-cream": U("photo-1497034825429-c343d7c6a68f"),
  cucumber: U("photo-1604977042946-1eecc30f269e"),
  "red-onions": U("photo-1518977956812-cd3dbadaaf31"),
  // sports
  basketball: U("photo-1546519638-68e109498ffc"),
  football: U("photo-1575361204480-aadea25e6e68"),
  "american-football": U("photo-1566577739112-5180d4bf9390"),
  "cricket-bat": U("photo-1531415074968-036ba1b575da"),
  "tennis-racket": U("photo-1554068865-24cecd4e34b8"),
  "tennis-ball": U("photo-1560012057-4372e14c5085"),
  "golf-ball": U("photo-1535131749006-b7f58c99034b"),
  "iron-golf": U("photo-1592919505780-303950717480"),
  // tablets
  "ipad-mini-2021-starlight": U("photo-1544244015-0df4b3ffc6b0"),
  "samsung-galaxy-tab-s8-plus-grey": U("photo-1561154464-82e9adf32764"),
};

/* ------------------------------------------------------------------ */
/* Category pools: verified real product photos, assigned              */
/* deterministically per product type so listings stay varied.         */
/* ------------------------------------------------------------------ */
const CATEGORY_POOLS = {
  beauty: [
    U("photo-1596462502278-27bfdc403348"),
    U("photo-1512496015851-a90fb38ba796"),
    U("photo-1522335789203-aabd1fc54bc9"),
    U("photo-1586495777744-4413f21062fa"),
  ],
  fragrances: [
    U("photo-1541643600914-78b084683601"),
    U("photo-1594035910387-fea47794261f"),
    U("photo-1523293182086-7651a899d37f"),
    U("photo-1587017539504-67cfbddac569"),
  ],
  furniture: [
    U("photo-1555041469-a586c61ea9bc"),
    U("photo-1505693416388-ac5ce068fe85"),
    U("photo-1538688525198-9b88f6f53126"),
    U("photo-1567538096630-e0c55bd6374c"),
    U("photo-1493663284031-b7e3aefcae8e"),
  ],
  groceries: [
    U("photo-1542838132-92c53300491e"),
    U("photo-1506617564039-2f3b650b7010"),
    U("photo-1543168256-418811576931"),
    U("photo-1550989460-0adf9ea622e2"),
  ],
  "home-decoration": [
    U("photo-1513519245088-0e12902e5a38"),
    U("photo-1507473885765-e6ed057f782c"),
    U("photo-1485955900006-10f4d324d411"),
    U("photo-1416879595882-3373a0480b5b"),
  ],
  "kitchen-accessories": [
    U("photo-1556909114-f6e7ad7d3136"),
    U("photo-1556911220-bff31c812dba"),
    U("photo-1590794056226-79ef3a8147e1"),
    U("photo-1593618998160-e34014e67546"),
    U("photo-1571175443880-49e1d25b2bc5"),
  ],
  laptops: [
    U("photo-1496181133206-80ce9b88a853"),
    U("photo-1611186871348-b1ce696e52c9"),
    U("photo-1588872657578-7efd1f1555ed"),
  ],
  "mens-shirts": [
    U("photo-1596755094514-f87e34085b2c"),
    U("photo-1602810318383-e386cc2a3ccf"),
    U("photo-1603252109303-2751441dd157"),
    U("photo-1620012253295-c15cc3e65df4"),
  ],
  "mens-shoes": [
    U("photo-1542291026-7eec264c27ff"),
    U("photo-1595950653106-6c9ebd614d3a"),
    U("photo-1600185365483-26d7a4cc7519"),
    U("photo-1552346154-21d32810aba3"),
  ],
  "mens-watches": [
    U("photo-1587836374828-4dbafa94cf0e"),
    U("photo-1523170335258-f5ed11844a49"),
    U("photo-1524592094714-0f0654e20314"),
    U("photo-1522312346375-d1a52e2b99b3"),
  ],
  "mobile-accessories": [
    U("photo-1572569511254-d8f925fe2cbb"),
    U("photo-1583394838336-acd977736f90"),
    U("photo-1600294037681-c80b4cb5b434"),
    U("photo-1551816230-ef5deaed4a26"),
  ],
  motorcycle: [
    U("photo-1558618666-fcd25c85cd64"),
    U("photo-1568772585407-9361f9bf3a87"),
    U("photo-1609630875171-b1321377ee65"),
  ],
  "skin-care": [
    U("photo-1556228720-195a672e8a03"),
    U("photo-1570172619644-dfd03ed5d881"),
    U("photo-1608248543803-ba4f8c70ae0b"),
  ],
  smartphones: [
    U("photo-1592750475338-74b7b21085ab"),
    U("photo-1511707171634-5f897ff02aa9"),
    U("photo-1580910051074-3eb694886505"),
    U("photo-1610945265064-0e34e5519bbf"),
  ],
  "sports-accessories": [
    U("photo-1546519638-68e109498ffc"),
    U("photo-1575361204480-aadea25e6e68"),
    U("photo-1554068865-24cecd4e34b8"),
    U("photo-1531415074968-036ba1b575da"),
  ],
  sunglasses: [
    U("photo-1572635196237-14b3f281503f"),
    U("photo-1511499767150-a48a237f0083"),
    U("photo-1577803645773-f96470509666"),
    U("photo-1473496169904-658ba7c44d8a"),
  ],
  tablets: [
    U("photo-1544244015-0df4b3ffc6b0"),
    U("photo-1561154464-82e9adf32764"),
    U("photo-1585790050230-5dd28404ccb9"),
  ],
  tops: [
    U("photo-1595777457583-95e059d581b8"),
    U("photo-1572804013309-59a88b7e92f1"),
    U("photo-1539008835657-9e8e9680c956"),
    U("photo-1490481651871-ab68de25d43d"),
  ],
  vehicle: [
    U("photo-1552519507-da3b142c6e3d"),
    U("photo-1494976388531-d1058494cdd8"),
    U("photo-1503376780353-7e6692767b70"),
    U("photo-1583121274602-3e2820c69888"),
  ],
  "womens-bags": [
    U("photo-1584917865442-de89df76afd3"),
    U("photo-1548036328-c9fa89d128fa"),
    U("photo-1591561954557-26941169b49e"),
    U("photo-1566150905458-1bf1fc113f0d"),
  ],
  "womens-dresses": [
    U("photo-1595777457583-95e059d581b8"),
    U("photo-1515372039744-b8f02a3ae446"),
    U("photo-1490481651871-ab68de25d43d"),
    U("photo-1572804013309-59a88b7e92f1"),
  ],
  "womens-jewellery": [
    U("photo-1535632066927-ab7c9ab60908"),
    U("photo-1515562141207-7a88fb7ce338"),
    U("photo-1602173574767-37ac01994b2a"),
  ],
  "womens-shoes": [
    U("photo-1543163521-1bf539c55dd2"),
    U("photo-1560343090-f0409e92791a"),
    U("photo-1595950653106-6c9ebd614d3a"),
  ],
  "womens-watches": [
    U("photo-1508057198894-247b23fe5ade"),
    U("photo-1526045612212-70caf35c14df"),
    U("photo-1549972574-8e3e1ed6a347"),
  ],
};

/* ------------------------------------------------------------------ */
/* URL verification: HTTP HEAD, 200 + image/*, timeout, 1 retry.       */
/* ------------------------------------------------------------------ */
function headOnce(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: "HEAD", timeout: timeoutMs }, (res) => {
      const ok =
        res.statusCode === 200 &&
        /^image\//i.test(String(res.headers["content-type"] || ""));
      res.resume();
      resolve(ok);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function verifyUrl(url) {
  return (await headOnce(url)) || (await headOnce(url));
}

async function verifyAll(urls, concurrency = 10) {
  const unique = [...new Set(urls)];
  const results = new Map();
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
      while (i < unique.length) {
        const url = unique[i++];
        results.set(url, await verifyUrl(url));
      }
    })
  );
  return results;
}

/* Deterministic hash so a given product type always gets the same image. */
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/* ------------------------------------------------------------------ */
async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("FATAL: SUPABASE_DB_URL / DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();

  try {
    const { rows: products } = await client.query(`
      SELECT id, name, images,
             split_part(images[1], '/', 5) AS dcat,
             split_part(images[1], '/', 6) AS slug
      FROM products
      WHERE images IS NOT NULL
        AND array_length(images, 1) >= 1
        AND images[1] LIKE 'https://cdn.dummyjson.com/%'
      ORDER BY id
    `);

    if (products.length === 0) {
      console.log("Nothing to do: no products reference cdn.dummyjson.com.");
      return;
    }
    console.log(`Found ${products.length} products with placeholder images.`);

    // Resolve the desired URL per product (override first, then pool).
    const desired = new Map(); // productId -> url
    const skippedNoMapping = [];
    for (const p of products) {
      const override = SLUG_OVERRIDES[p.slug];
      const pool = CATEGORY_POOLS[p.dcat];
      let url = override || null;
      if (!url && pool && pool.length > 0) {
        url = pool[hashStr(p.slug || p.name) % pool.length];
      }
      if (url) desired.set(p.id, url);
      else skippedNoMapping.push(`${p.name} [${p.dcat}/${p.slug}]`);
    }

    // Live-verify every unique URL before touching the DB.
    console.log(`Verifying ${new Set(desired.values()).size} unique image URLs...`);
    const verified = await verifyAll([...desired.values()]);

    const updates = [];
    const skippedDeadUrl = [];
    for (const p of products) {
      const url = desired.get(p.id);
      if (!url) continue;
      if (verified.get(url)) updates.push({ id: p.id, name: p.name, url });
      else skippedDeadUrl.push(`${p.name} -> ${url}`);
    }

    const deadCount = [...verified.values()].filter((v) => !v).length;
    console.log(`URL check: ${verified.size - deadCount} ok, ${deadCount} failed.`);
    if (skippedDeadUrl.length) {
      console.log(`KEEPING old image for ${skippedDeadUrl.length} products (unverified URL):`);
      [...new Set(skippedDeadUrl.map((s) => s.split(" -> ")[1]))].forEach((u) =>
        console.log(`  dead: ${u}`)
      );
    }
    if (skippedNoMapping.length) {
      console.log(`No mapping for ${skippedNoMapping.length} products (kept as-is):`);
      skippedNoMapping.slice(0, 10).forEach((s) => console.log(`  ${s}`));
    }

    console.log(`\n${APPLY ? "APPLYING" : "DRY RUN:"} ${updates.length} image updates.`);
    if (!APPLY) {
      updates.slice(0, 10).forEach((u) => console.log(`  ${u.name} -> ${u.url}`));
      console.log("\nRe-run with --apply to write these changes.");
      return;
    }

    await client.query("BEGIN");
    let done = 0;
    for (const u of updates) {
      await client.query(
        `UPDATE products SET images = ARRAY[$1]::text[], updated_at = now() WHERE id = $2`,
        [u.url, u.id]
      );
      done++;
    }
    await client.query("COMMIT");
    console.log(`Committed ${done} updates.`);

    const { rows: [after] } = await client.query(`
      SELECT count(*) FILTER (WHERE images[1] LIKE '%dummyjson%')::int AS still_placeholder,
             count(*) FILTER (WHERE images[1] LIKE '%unsplash%')::int AS real_photos,
             count(*)::int AS total
      FROM products
    `);
    console.log("Post-apply state:", JSON.stringify(after));
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("FAILED (rolled back):", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
