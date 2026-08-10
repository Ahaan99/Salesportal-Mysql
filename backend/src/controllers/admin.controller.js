const { supabaseAdmin } = require("../config/supabase");

/**
 * ADMIN API — product review queue (approve / reject vendor listings).
 *
 * Every route is mounted behind requireAuth + requireRole("admin").
 * Vendor-submitted products land in status 'review' (catalog.controller)
 * and are invisible to field officers / buyers until an admin moves them
 * to 'live' here. Rejections carry a mandatory reason the vendor can see.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_STATUSES = ["review", "live", "rejected", "draft", "archived"];
const MAX_REASON = 1000;

const clamp = (n, min, max, fallback) => {
  const v = Number.parseInt(n, 10);
  if (Number.isNaN(v)) return fallback;
  return Math.min(Math.max(v, min), max);
};

// Same whitelist sanitizer as the other controllers — strips PostgREST
// filter grammar so crafted search input is inert instead of a 500.
const sanitizeSearch = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

/** Batch-resolve auth user ids to display names via the user_names RPC. */
async function resolveOwnerNames(ownerIds) {
  const unique = [...new Set(ownerIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.rpc("user_names", { p_ids: unique });
  if (error) {
    // Names are decoration — never fail the listing because of them.
    console.error("[admin:user-names]", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.id, r.name]));
}

/**
 * GET /api/admin/products?status=review&q=&page=&page_size=
 * Moderation queue — defaults to products awaiting review, oldest first
 * (fairness: first submitted, first reviewed). Other statuses newest first.
 */
async function listProducts(req, res) {
  try {
    const status = PRODUCT_STATUSES.includes(req.query.status) ? req.query.status : "review";
    const page = clamp(req.query.page, 1, 100000, 1);
    const pageSize = clamp(req.query.page_size, 1, 50, 12);
    const from = (page - 1) * pageSize;

    let query = supabaseAdmin
      .from("products")
      .select(
        "id, owner_id, name, brand, description, price, mrp, stock, sku, images, status, review_note, reviewed_at, created_at, categories(name)",
        { count: "exact" }
      )
      .eq("status", status);

    const q = sanitizeSearch(req.query.q);
    if (q) {
      const term = `%${q}%`;
      query = query.or(`name.ilike.${term},brand.ilike.${term},sku.ilike.${term}`);
    }

    query = query
      .order("created_at", { ascending: status === "review" })
      .order("id", { ascending: true }) // stable tiebreaker for pagination
      .range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (error.code === "PGRST103") {
        return res.json({ products: [], total: count ?? 0, page, pageSize });
      }
      console.error("[admin:products]", error.message);
      return res.status(500).json({ error: "Could not load the review queue." });
    }

    const rows = data ?? [];
    const names = await resolveOwnerNames(rows.map((p) => p.owner_id));
    const products = rows.map(({ categories, ...p }) => ({
      ...p,
      category: categories?.name ?? null,
      owner_name: names.get(p.owner_id) ?? "Unknown vendor",
    }));

    return res.json({ products, total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error("[admin:products]", err.message);
    return res.status(500).json({ error: "Could not load the review queue." });
  }
}

/**
 * GET /api/admin/products/counts
 * Badge counts for the moderation tabs (review / live / rejected).
 */
async function getProductCounts(_req, res) {
  try {
    const counts = {};
    await Promise.all(
      ["review", "live", "rejected"].map(async (status) => {
        const { count, error } = await supabaseAdmin
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        if (error) throw new Error(error.message);
        counts[status] = count ?? 0;
      })
    );
    return res.json({ counts });
  } catch (err) {
    console.error("[admin:product-counts]", err.message);
    return res.status(500).json({ error: "Could not load product counts." });
  }
}

/** Fire-and-forget vendor notification — reviews must not fail on this. */
async function notifyOwner({ ownerId, approved, productName, reason }) {
  const title = approved ? "Product approved" : "Product rejected";
  const body = approved
    ? `"${productName}" is now live on the marketplace.`.slice(0, 500)
    : `"${productName}" was rejected: ${reason}`.slice(0, 500);
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: ownerId,
    type: "product",
    title,
    body,
    link: "/client/products",
  });
  if (error) console.error("[admin:notify]", error.message);
}

/**
 * PATCH /api/admin/products/:id/review   { action: "approve"|"reject", reason? }
 * Guarded transition: only products currently in 'review' can be decided.
 * The .eq("status","review") filter makes the update atomic — two admins
 * racing on the same product can never double-decide it.
 */
async function reviewProduct(req, res) {
  try {
    const id = String(req.params.id ?? "");
    if (!UUID_RE.test(id)) return res.status(404).json({ error: "Product not found." });

    const action = req.body?.action;
    if (action !== "approve" && action !== "reject") {
      return res.status(422).json({ error: "Action must be approve or reject." });
    }

    const reason = String(req.body?.reason ?? "").trim();
    if (action === "reject") {
      if (reason.length < 5) {
        return res.status(422).json({
          error: "Please give the vendor a rejection reason (at least 5 characters).",
          fields: { reason: "A short reason is required." },
        });
      }
      if (reason.length > MAX_REASON) {
        return res.status(422).json({
          error: `Reason is too long (max ${MAX_REASON} characters).`,
          fields: { reason: `Max ${MAX_REASON} characters.` },
        });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .update({
        status: action === "approve" ? "live" : "rejected",
        review_note: action === "approve" ? null : reason,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "review") // atomic guard: only pending products
      .select("id, owner_id, name, status, review_note, reviewed_at")
      .maybeSingle();

    if (error) {
      console.error("[admin:review]", error.message);
      return res.status(500).json({ error: "Could not save the review decision." });
    }
    if (!data) {
      // Either the id doesn't exist or someone already decided it.
      const { data: current } = await supabaseAdmin
        .from("products")
        .select("id, status")
        .eq("id", id)
        .maybeSingle();
      if (!current) return res.status(404).json({ error: "Product not found." });
      return res.status(409).json({
        error: `This product was already moved to "${current.status}" by another review.`,
      });
    }

    // Notify the vendor (never blocks the response on failure).
    notifyOwner({
      ownerId: data.owner_id,
      approved: action === "approve",
      productName: data.name,
      reason,
    });

    return res.json({ product: data });
  } catch (err) {
    console.error("[admin:review]", err.message);
    return res.status(500).json({ error: "Could not save the review decision." });
  }
}

module.exports = { listProducts, getProductCounts, reviewProduct };
