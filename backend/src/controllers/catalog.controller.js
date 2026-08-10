const { supabaseAdmin } = require("../config/supabase");

// ---- categories (in-memory cache: reference data changes rarely) ----
let categoriesCache = { data: null, at: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getCategories(_req, res, next) {
  try {
    if (categoriesCache.data && Date.now() - categoriesCache.at < CACHE_TTL_MS) {
      return res.json({ categories: categoriesCache.data });
    }
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, parent_id, level, sort_order")
      .order("level")
      .order("sort_order")
      .order("name");
    if (error) throw Object.assign(new Error(error.message), { publicMessage: "Could not load categories." });
    categoriesCache = { data, at: Date.now() };
    res.json({ categories: data });
  } catch (e) {
    next(e);
  }
}

// ---- shared validation ----
const MAX_IMAGES = 7;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An image reference is valid if it is:
 *  - an https URL, or
 *  - a root-relative path to a local asset (e.g. /products/mrd-1717.png).
 * Protocol-relative URLs (//evil.com) and path traversal (..) are rejected.
 */
function isValidImageRef(value) {
  const s = String(value ?? "").trim();
  if (!s || s.length > 2048) return false;
  if (s.startsWith("https://")) {
    try {
      const u = new URL(s);
      return u.protocol === "https:";
    } catch {
      return false;
    }
  }
  return /^\/(?!\/)[\w\-./@%]+$/.test(s) && !s.includes("..");
}

function validateProduct(body) {
  const errors = {};
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const brand = String(body.brand ?? "").trim();
  const price = Number(body.price);
  const mrp = body.mrp === "" || body.mrp == null ? null : Number(body.mrp);
  const stock = Number(body.stock);
  const categoryId = Number(body.categoryId);
  const images = Array.isArray(body.images) ? body.images.map((i) => String(i).trim()).filter(Boolean) : [];

  if (name.length < 3 || name.length > 180) errors.name = "Name must be 3-180 characters.";
  if (description.length > 5000) errors.description = "Description is too long (max 5000).";
  if (!Number.isFinite(price) || price <= 0 || price > 10000000) errors.price = "Enter a valid selling price.";
  if (mrp !== null && (!Number.isFinite(mrp) || mrp < price)) errors.mrp = "MRP must be greater than or equal to the selling price.";
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) errors.stock = "Enter a valid stock quantity.";
  if (!Number.isInteger(categoryId) || categoryId <= 0) errors.categoryId = "Pick a category.";
  if (images.length > MAX_IMAGES) errors.images = `Maximum ${MAX_IMAGES} images.`;
  if (!errors.images) {
    for (const url of images) {
      if (!isValidImageRef(url)) {
        errors.images = "Image links must be https URLs or local /paths.";
        break;
      }
    }
  }
  return { errors, clean: { name, description, brand, price, mrp, stock, categoryId, images } };
}

/** Category must exist and be a leaf (level 2). Returns an error response or null. */
async function assertLeafCategory(categoryId, res) {
  const { data: cat, error } = await supabaseAdmin
    .from("categories")
    .select("id, level")
    .eq("id", categoryId)
    .maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { publicMessage: "Could not verify category." });
  if (!cat || cat.level !== 2) {
    res.status(422).json({ error: "Please choose a specific subcategory.", fields: { categoryId: "Pick a subcategory." } });
    return true;
  }
  return false;
}

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ---- product launch (client only) ----
async function createProduct(req, res, next) {
  try {
    const { errors, clean } = validateProduct(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: "Please fix the highlighted fields.", fields: errors });
    }
    if (await assertLeafCategory(clean.categoryId, res)) return;

    const sku = `MRD-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 36 ** 2).toString(36).toUpperCase()}`;

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert({
        owner_id: req.user.id,
        category_id: clean.categoryId,
        name: clean.name,
        slug: slugify(clean.name),
        brand: clean.brand || null,
        description: clean.description || null,
        price: clean.price,
        mrp: clean.mrp,
        stock: clean.stock,
        sku,
        status: "review",
        images: clean.images,
      })
      .select("id, name, sku, status, created_at")
      .single();
    if (error) throw Object.assign(new Error(error.message), { publicMessage: "Could not create the product." });

    res.status(201).json({ product: data });
  } catch (e) {
    next(e);
  }
}

// ---- edit product (client only, own products) ----
async function updateProduct(req, res, next) {
  try {
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ error: "Product not found." });
    }

    // Ownership check happens in the query itself — a vendor can never read
    // or touch another vendor's row, and we don't leak its existence (404).
    const { data: existing, error: readErr } = await supabaseAdmin
      .from("products")
      .select("id, name, brand, description, price, mrp, stock, status, images, category_id")
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .maybeSingle();
    if (readErr) throw Object.assign(new Error(readErr.message), { publicMessage: "Could not load the product." });
    if (!existing) return res.status(404).json({ error: "Product not found." });
    if (existing.status === "archived") {
      return res.status(409).json({ error: "Archived products cannot be edited." });
    }

    // Partial update: merge incoming fields over current values, then run the
    // exact same validation as create so the two paths can never drift.
    const body = req.body || {};
    const merged = {
      name: body.name === undefined ? existing.name : body.name,
      brand: body.brand === undefined ? existing.brand ?? "" : body.brand,
      description: body.description === undefined ? existing.description ?? "" : body.description,
      price: body.price === undefined ? existing.price : body.price,
      mrp: body.mrp === undefined ? existing.mrp : body.mrp,
      stock: body.stock === undefined ? existing.stock : body.stock,
      categoryId: body.categoryId === undefined ? existing.category_id : body.categoryId,
      images: body.images === undefined ? existing.images : body.images,
    };
    const { errors, clean } = validateProduct(merged);
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: "Please fix the highlighted fields.", fields: errors });
    }
    if (clean.categoryId !== existing.category_id && (await assertLeafCategory(clean.categoryId, res))) return;

    const patch = {
      name: clean.name,
      slug: slugify(clean.name),
      brand: clean.brand || null,
      description: clean.description || null,
      price: clean.price,
      mrp: clean.mrp,
      stock: clean.stock,
      category_id: clean.categoryId,
      images: clean.images,
      updated_at: new Date().toISOString(),
    };
    // A rejected product that the vendor edits is a resubmission: it goes
    // back into the admin review queue and the old rejection note is cleared.
    if (existing.status === "rejected") {
      patch.status = "review";
      patch.review_note = null;
      patch.reviewed_at = null;
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(patch)
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .select("id, name, brand, price, mrp, stock, sku, status, images, rating, review_note, reviewed_at, created_at, description, category_id")
      .single();
    if (error) throw Object.assign(new Error(error.message), { publicMessage: "Could not update the product." });

    res.json({ product: data });
  } catch (e) {
    next(e);
  }
}

// ---- delete product (client only, own products) ----
async function deleteProduct(req, res, next) {
  try {
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ error: "Product not found." });
    }

    const { data: existing, error: readErr } = await supabaseAdmin
      .from("products")
      .select("id, name, status")
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .maybeSingle();
    if (readErr) throw Object.assign(new Error(readErr.message), { publicMessage: "Could not load the product." });
    if (!existing) return res.status(404).json({ error: "Product not found." });

    // Try a hard delete first. If ANY table still references this product
    // (order items, returns, refunds, ...), Postgres raises FK violation
    // 23503 — in that case we must preserve history, so we archive instead.
    // This is future-proof: new referencing tables are handled automatically.
    const { error: delErr } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (!delErr) {
      return res.json({ deleted: true, archived: false });
    }

    if (delErr.code === "23503") {
      const { error: archErr } = await supabaseAdmin
        .from("products")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", req.user.id);
      if (archErr) throw Object.assign(new Error(archErr.message), { publicMessage: "Could not archive the product." });
      return res.json({
        deleted: false,
        archived: true,
        message: "This product has order history, so it was archived instead of deleted. It is no longer visible to buyers.",
      });
    }

    throw Object.assign(new Error(delErr.message), { publicMessage: "Could not delete the product." });
  } catch (e) {
    next(e);
  }
}

// ---- my products (used for review step + catalogue page) ----
async function getMyProducts(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 12));
    const from = (page - 1) * pageSize;

    const { data, error, count } = await supabaseAdmin
      .from("products")
      .select("id, name, brand, price, mrp, stock, sku, status, images, rating, review_note, reviewed_at, created_at, description, category_id", { count: "exact" })
      .eq("owner_id", req.user.id)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw Object.assign(new Error(error.message), { publicMessage: "Could not load products." });

    res.json({ products: data, total: count, page, pageSize });
  } catch (e) {
    next(e);
  }
}

module.exports = { getCategories, createProduct, updateProduct, deleteProduct, getMyProducts };
