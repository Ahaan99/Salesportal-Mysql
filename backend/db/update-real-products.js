/**
 * Recruweb Sales Portal — replace demo variants with REAL market products
 *
 * Usage:   node db/update-real-products.js            (apply changes)
 *          node db/update-real-products.js --dry-run  (print plan, change nothing)
 *
 * What it does (inside a single transaction — all or nothing):
 *   1. UPDATES the 4 demo products shown on the storefront (by SKU) into
 *      real, currently-available products (BIBA, Lavie, Caprese, Ray-Ban).
 *      SKUs and product ids are preserved, so existing orders/returns/refunds
 *      that reference these products stay 100% consistent.
 *   2. INSERTS 12 new real products (Apple, Samsung, boAt, Sony, Nike, Titan,
 *      Prestige, Philips, Milton, HP, Noise, Wildcraft) — all status 'live',
 *      each with a branded image placeholder of the product.
 *
 * Edge cases handled:
 *   - Idempotent: re-running is safe (updates are absolute, inserts upsert on SKU).
 *   - Transactional: any failure rolls back everything.
 *   - Missing SKU: warns and continues (does not abort the whole run).
 *   - Missing category slug: falls back to a valid category and warns.
 *   - No client owner found: aborts with a clear message before touching data.
 *   - Schema constraints respected: mrp >= price, 0 <= rating <= 5,
 *     3 <= name length <= 180, description <= 5000, stock >= 0.
 *   - Connection fallback chain identical to db/seed.js.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require("pg");

const DRY_RUN = process.argv.includes("--dry-run");
const PROJECT_ID = process.env.SUPABASE_PROJECT_ID || "pwawfxpyroejzxskagbw";
const DB_PASSWORD = process.env.SUPABASE_DATABASE_PASSWORD;

// ---------------------------------------------------------------- connection
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
      console.log(`[update] connected via ${host}`);
      return client;
    } catch (e) {
      lastErr = e;
      console.log(`[update] connection failed (${e.message.slice(0, 60)}), trying next...`);
      try { await client.end(); } catch {}
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- helpers
const slugify = (s) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Branded placeholder image of the product (600x600 PNG, warm neutral bg). */
const placeholder = (label) =>
  `https://placehold.co/600x600/f4f1ea/2d2a26.png?text=${encodeURIComponent(label).replace(/%20/g, "+")}`;

/** Validate a product row against schema CHECK constraints before touching the DB. */
function validate(p) {
  const errors = [];
  if (!p.name || p.name.length < 3 || p.name.length > 180) errors.push(`name length invalid: "${p.name}"`);
  if (!(p.price > 0)) errors.push(`price must be > 0 (got ${p.price})`);
  if (p.mrp != null && p.mrp < p.price) errors.push(`mrp (${p.mrp}) < price (${p.price})`);
  if (p.stock == null || p.stock < 0 || !Number.isInteger(p.stock)) errors.push(`stock invalid: ${p.stock}`);
  if (p.rating != null && (p.rating < 0 || p.rating > 5)) errors.push(`rating out of range: ${p.rating}`);
  if (p.description && p.description.length > 5000) errors.push("description exceeds 5000 chars");
  if (errors.length) throw new Error(`Validation failed for ${p.sku}: ${errors.join("; ")}`);
  return p;
}

// ---------------------------------------------------------------- data
// 1) The four demo products currently visible on the storefront, replaced
//    in-place (same SKU, same row id) with real market products.
const REPLACEMENTS = [
  {
    sku: "MRD-1717", // was: "Dress Pea (Pack of 2)" — BIBA
    name: "BIBA Women's Red Polka Dot Fit & Flare Midi Dress",
    brand: "BIBA",
    description:
      "A breezy fit-and-flare midi dress from BIBA in crisp white with playful red polka dots. " +
      "Sweetheart neckline with bow detail, cinched waist and a flowy gathered skirt. " +
      "Lightweight machine-washable poly-crepe — perfect for brunches, day outings and casual workwear.",
    price: 2999, mrp: 3999, stock: 120, rating: 4.4,
    categorySlug: "western-wear-dresses",
    imageLabel: "BIBA Polka Dot Dress",
  },
  {
    sku: "MRD-1684", // was: "Blue Women's Handbag" — Fashionista
    name: "Lavie Betula Women's Tote Handbag — Navy Blue",
    brand: "Lavie",
    description:
      "The Lavie Betula tote in deep navy vegan leather. Spacious main compartment with zip closure, " +
      "inner organiser pockets and sturdy twin handles. Water-resistant finish and premium metal " +
      "hardware — an everyday workhorse for office, travel and weekends.",
    price: 2199, mrp: 4299, stock: 85, rating: 4.3,
    categorySlug: "handbags-and-clutches-handbags",
    imageLabel: "Lavie Betula Tote",
  },
  {
    sku: "MRD-1685", // was: "Blue Women's Handbag (Pack of 2)" — Fashionista
    name: "Caprese Kimmy Women's Structured Satchel — Royal Blue",
    brand: "Caprese",
    description:
      "Caprese Kimmy structured satchel in royal blue with a clean silhouette and croc-texture panels. " +
      "Detachable sling strap, magnetic snap + zip closure, and a padded inner sleeve that fits a " +
      "10-inch tablet. Scratch-resistant faux leather with a soft fabric lining.",
    price: 2649, mrp: 4999, stock: 64, rating: 4.2,
    categorySlug: "handbags-and-clutches-handbags",
    imageLabel: "Caprese Kimmy Satchel",
  },
  {
    sku: "MRD-1619", // was: "Classic Sun Glasses — Value Pack" — Fashion Shades
    name: "Ray-Ban Aviator Classic RB3025 — Gold / Grey Gradient",
    brand: "Ray-Ban",
    description:
      "The original Ray-Ban Aviator RB3025 with a gold metal frame and grey gradient crystal lenses. " +
      "100% UV protection, adjustable nose pads and the timeless teardrop shape worn since 1937. " +
      "Includes branded hard case and cleaning cloth. Made by Luxottica.",
    price: 8290, mrp: 9990, stock: 42, rating: 4.7,
    categorySlug: "accessories-sunglasses",
    imageLabel: "Ray-Ban Aviator RB3025",
  },
];

// 2) New real, currently-available products — all live, with placeholders.
const NEW_PRODUCTS = [
  {
    sku: "MRD-9001",
    name: "Apple iPhone 15 (128GB) — Black",
    brand: "Apple",
    description:
      "iPhone 15 with the Dynamic Island, a 48MP main camera with 2x telephoto quality zoom, " +
      "A16 Bionic chip and USB-C. 6.1-inch Super Retina XDR display with Ceramic Shield front.",
    price: 60999, mrp: 69900, stock: 35, rating: 4.6,
    categorySlug: "mobiles-and-accessories-smartphones",
    imageLabel: "Apple iPhone 15",
  },
  {
    sku: "MRD-9002",
    name: "Samsung Galaxy M35 5G (8GB RAM, 128GB) — Moonlight Blue",
    brand: "Samsung",
    description:
      "Galaxy M35 5G with a 6.6-inch sAMOLED 120Hz display, Exynos 1380, 50MP triple camera, " +
      "6000mAh battery and 4 generations of OS upgrades. Corning Gorilla Glass Victus+.",
    price: 17999, mrp: 24999, stock: 90, rating: 4.3,
    categorySlug: "mobiles-and-accessories-smartphones",
    imageLabel: "Samsung Galaxy M35 5G",
  },
  {
    sku: "MRD-9003",
    name: "boAt Airdopes 141 TWS Earbuds — Bold Black",
    brand: "boAt",
    description:
      "boAt Airdopes 141 with 42 hours total playback, ENx noise-cancelling mics for calls, " +
      "low-latency BEAST mode for gaming, IPX4 water resistance and ASAP fast charge.",
    price: 1099, mrp: 4490, stock: 250, rating: 4.2,
    categorySlug: "audio-earphones",
    imageLabel: "boAt Airdopes 141",
  },
  {
    sku: "MRD-9004",
    name: "Sony WH-CH520 Wireless Bluetooth Headphones — Black",
    brand: "Sony",
    description:
      "Sony WH-CH520 on-ear wireless headphones with up to 50 hours battery, DSEE audio upscaling, " +
      "multipoint connection for two devices, and Fast Pair. Lightweight 147g swivel design.",
    price: 3989, mrp: 5990, stock: 75, rating: 4.4,
    categorySlug: "audio-bluetooth-headphones",
    imageLabel: "Sony WH-CH520",
  },
  {
    sku: "MRD-9005",
    name: "Noise ColorFit Pro 5 Smart Watch — Jet Black",
    brand: "Noise",
    description:
      "Noise ColorFit Pro 5 with a 1.85-inch AMOLED display, Bluetooth calling, 100+ sports modes, " +
      "heart-rate and SpO2 monitoring, and up to 7 days battery life. IP68 dust and water resistant.",
    price: 2999, mrp: 7999, stock: 140, rating: 4.1,
    categorySlug: "wearables-smart-watches",
    imageLabel: "Noise ColorFit Pro 5",
  },
  {
    sku: "MRD-9006",
    name: "Nike Revolution 7 Men's Road Running Shoes — Black/White",
    brand: "Nike",
    description:
      "Nike Revolution 7 with soft foam cushioning for a smooth ride, breathable mesh upper, " +
      "flex grooves for natural motion and a durable rubber outsole. Everyday running comfort.",
    price: 3695, mrp: 4995, stock: 110, rating: 4.5,
    categorySlug: "footwear-sports-shoes",
    imageLabel: "Nike Revolution 7",
  },
  {
    sku: "MRD-9007",
    name: "Titan Neo Splash Analog Men's Watch — Blue Dial, Leather Strap",
    brand: "Titan",
    description:
      "Titan Neo Splash quartz analog watch with a blue dial, date display, genuine leather strap, " +
      "mineral glass and 50m water resistance. Backed by Titan's 24-month warranty.",
    price: 4495, mrp: 4995, stock: 60, rating: 4.4,
    categorySlug: "accessories-watches",
    imageLabel: "Titan Neo Splash",
  },
  {
    sku: "MRD-9008",
    name: "Prestige Svachh 5 Litre Aluminium Pressure Cooker",
    brand: "Prestige",
    description:
      "Prestige Svachh 5L outer-lid pressure cooker with unique deep-lid spillage control, " +
      "metallic safety plug and gasket release system. Gas and induction compatible. ISI certified.",
    price: 2035, mrp: 3095, stock: 95, rating: 4.5,
    categorySlug: "cookware-pressure-cookers",
    imageLabel: "Prestige Svachh 5L",
  },
  {
    sku: "MRD-9009",
    name: "Philips HL7756/00 750W Mixer Grinder with 3 Jars — Black",
    brand: "Philips",
    description:
      "Philips HL7756 mixer grinder with a 750W turbo motor, advanced air ventilation for cooler " +
      "grinding, leak-proof jars with semi-transparent lids and 5-year motor warranty.",
    price: 3999, mrp: 7295, stock: 70, rating: 4.5,
    categorySlug: "small-appliances-mixer-grinders",
    imageLabel: "Philips HL7756 Mixer",
  },
  {
    sku: "MRD-9010",
    name: "Milton Thermosteel Flip Lid 1000ml Vacuum Flask — Silver",
    brand: "Milton",
    description:
      "Milton Thermosteel 1L double-walled vacuum insulated flask keeps beverages hot or cold for " +
      "24 hours. Food-grade 304 stainless steel, leak-proof flip lid and rugged rust-free body.",
    price: 899, mrp: 1450, stock: 300, rating: 4.4,
    categorySlug: "kitchen-storage-water-bottles",
    imageLabel: "Milton Thermosteel 1L",
  },
  {
    sku: "MRD-9011",
    name: "HP 15s 12th Gen Intel Core i5 Laptop (16GB/512GB SSD) — Silver",
    brand: "HP",
    description:
      "HP 15s thin-and-light laptop with 12th Gen Intel Core i5-1235U, 16GB DDR4 RAM, 512GB SSD, " +
      "15.6-inch FHD anti-glare micro-edge display, backlit keyboard and Windows 11 + MS Office.",
    price: 52490, mrp: 62704, stock: 25, rating: 4.3,
    categorySlug: "computers-laptops",
    imageLabel: "HP 15s i5 Laptop",
  },
  {
    sku: "MRD-9012",
    name: "Wildcraft Evo 44L Water-Resistant Laptop Backpack — Black",
    brand: "Wildcraft",
    description:
      "Wildcraft Evo 44L backpack with a dedicated padded laptop sleeve (up to 17-inch), " +
      "3 spacious compartments, ergonomic padded shoulder straps and water-resistant fabric.",
    price: 1899, mrp: 3299, stock: 130, rating: 4.3,
    categorySlug: "luggage-backpacks",
    imageLabel: "Wildcraft Evo 44L",
  },
];

// ---------------------------------------------------------------- main
(async () => {
  // Fail fast on bad data before opening any connection.
  [...REPLACEMENTS, ...NEW_PRODUCTS].forEach(validate);

  const db = await connect();
  try {
    // Resolve category slugs -> ids once, with a safe fallback.
    const { rows: catRows } = await db.query("select id, slug from categories where level = 2");
    if (!catRows.length) throw new Error("No subcategories found — run db/seed.js first");
    const catBySlug = Object.fromEntries(catRows.map((r) => [r.slug, r.id]));
    const fallbackCat = catRows[0].id;
    const resolveCat = (slug, sku) => {
      if (catBySlug[slug]) return catBySlug[slug];
      console.warn(`[update] WARN: category slug "${slug}" not found for ${sku} — using fallback`);
      return fallbackCat;
    };

    // Owner for the new products: prefer the owner of the products we are
    // replacing (keeps everything under the same client account), otherwise
    // the first confirmed client user.
    const { rows: ownerRows } = await db.query(
      `select owner_id from products where sku = any($1::text[]) limit 1`,
      [REPLACEMENTS.map((r) => r.sku)]
    );
    let ownerId = ownerRows[0]?.owner_id;
    if (!ownerId) {
      const { rows } = await db.query(
        `select id from auth.users
         where coalesce(raw_user_meta_data->>'role', 'client') = 'client'
           and email_confirmed_at is not null
         limit 1`
      );
      ownerId = rows[0]?.id;
    }
    if (!ownerId) throw new Error("No client owner found — sign up at least one client first");

    if (DRY_RUN) {
      console.log("[update] DRY RUN — no changes will be made\n");
      REPLACEMENTS.forEach((p) => console.log(`  UPDATE ${p.sku}  ->  ${p.name}`));
      NEW_PRODUCTS.forEach((p) => console.log(`  INSERT ${p.sku}  ->  ${p.name} (live)`));
      return;
    }

    await db.query("begin");

    // ---- 1) Replace the four storefront demo products in place
    let updated = 0;
    for (const p of REPLACEMENTS) {
      const { rowCount } = await db.query(
        `update products
            set name = $1, slug = $2, brand = $3, description = $4,
                price = $5, mrp = $6, stock = $7, rating = $8,
                category_id = $9, status = 'live',
                images = array[$10]::text[]
          where sku = $11`,
        [
          p.name, slugify(p.name), p.brand, p.description,
          p.price, p.mrp, p.stock, p.rating,
          resolveCat(p.categorySlug, p.sku),
          placeholder(p.imageLabel),
          p.sku,
        ]
      );
      if (rowCount === 0) {
        console.warn(`[update] WARN: SKU ${p.sku} not found — skipped (nothing updated)`);
      } else {
        updated += rowCount;
        console.log(`[update] replaced ${p.sku} -> ${p.name}`);
      }
    }

    // ---- 2) Insert the new live real products (idempotent upsert on SKU)
    let inserted = 0;
    for (const p of NEW_PRODUCTS) {
      const { rowCount } = await db.query(
        `insert into products (owner_id, category_id, name, slug, brand, description,
                               price, mrp, stock, sku, status, images, rating)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'live', array[$11]::text[], $12)
         on conflict (sku) do update
           set name = excluded.name, slug = excluded.slug, brand = excluded.brand,
               description = excluded.description, price = excluded.price,
               mrp = excluded.mrp, stock = excluded.stock, status = 'live',
               images = excluded.images, rating = excluded.rating,
               category_id = excluded.category_id`,
        [
          ownerId, resolveCat(p.categorySlug, p.sku), p.name, slugify(p.name), p.brand,
          p.description, p.price, p.mrp, p.stock, p.sku,
          placeholder(p.imageLabel), p.rating,
        ]
      );
      inserted += rowCount;
      console.log(`[update] upserted ${p.sku} -> ${p.name}`);
    }

    await db.query("commit");
    console.log(`\n[update] DONE — ${updated} replaced, ${inserted} new live products`);
  } catch (e) {
    try { await db.query("rollback"); } catch {}
    throw e;
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error("[update] FATAL:", e.message);
  process.exit(1);
});
