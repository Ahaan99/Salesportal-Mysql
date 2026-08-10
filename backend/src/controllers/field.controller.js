const { supabaseAdmin } = require("../config/supabase");
const { normalizePhone, PHONE_ERROR } = require("../utils/phone");

/**
 * FIELD OFFICER API — profile, live catalogue, order placement,
 * commissions, earnings, and performance.
 *
 * Every route is mounted behind requireAuth + requireRole("field"),
 * and every query is scoped to req.user.id — an officer can never
 * read or write another officer's data, no matter what ids the
 * request carries.
 */

const REGIONS = ["North", "South", "East", "West"];
const ORDER_STATUSES = ["processing", "packed", "in-transit", "delivered", "cancelled", "returned"];
const COMMISSION_STATUSES = ["pending", "settled"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const PROFILE_COLUMNS =
  "user_id, full_name, phone, city, state, region, address, photo_url, " +
  "bank_name, bank_account, bank_ifsc, monthly_target, joined_at, seller_category";

// Two ways to sell: 'field' = Field Sales Person (territory beat),
// 'independent' = Independent Seller (anyone can join and sell).
const SELLER_CATEGORIES = ["field", "independent"];

const clamp = (n, min, max, fallback) => {
  const v = Number.parseInt(n, 10);
  if (Number.isNaN(v)) return fallback;
  return Math.min(Math.max(v, min), max);
};

// Whitelist sanitizer for free-text search inside PostgREST `or=` filters
// (same approach as orders.controller — strips filter grammar so crafted
// input is inert instead of a 500).
const sanitizeSearch = (s) =>
  s
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();


const trimmed = (v, max) => String(v ?? "").trim().slice(0, max);

/* ------------------------------- profile ------------------------------- */

/** GET /api/field/profile — the officer's own profile (null if not created). */
async function getProfile(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      console.error("[field:profile:get]", error.message);
      return res.status(500).json({ error: "Could not load your profile." });
    }
    return res.json({ profile: data ?? null });
  } catch (err) {
    console.error("[field:profile:get]", err.message);
    return res.status(500).json({ error: "Could not load your profile." });
  }
}

/**
 * PUT /api/field/profile — create or update the officer's profile.
 * monthly_target is intentionally NOT accepted: targets are set by admins.
 */
async function upsertProfile(req, res) {
  try {
    const body = req.body || {};
    const errors = {};

    const fullName = trimmed(body.full_name, 200);
    if (fullName.length < 2 || fullName.length > 120) {
      errors.full_name = "Full name must be 2-120 characters.";
    }

    const phone = normalizePhone(body.phone);
    if (!phone.ok) errors.phone = PHONE_ERROR;

    const city = trimmed(body.city, 120);
    const state = trimmed(body.state, 120);

    let region = trimmed(body.region, 20);
    if (region && !REGIONS.includes(region)) {
      errors.region = "Region must be North, South, East, or West.";
    }

    const address = trimmed(body.address, 600);
    if (address.length > 500) errors.address = "Address is too long (max 500).";

    let photoUrl = trimmed(body.photo_url, 500);
    if (photoUrl) {
      try {
        const u = new URL(photoUrl);
        if (u.protocol !== "https:") throw new Error();
      } catch {
        errors.photo_url = "Photo link must be a valid https URL.";
      }
    }

    const bankName = trimmed(body.bank_name, 120);
    const bankAccount = trimmed(body.bank_account, 30);
    if (bankAccount && !/^[0-9]{6,20}$/.test(bankAccount)) {
      errors.bank_account = "Account number must be 6-20 digits.";
    }
    const bankIfsc = trimmed(body.bank_ifsc, 15).toUpperCase();
    if (bankIfsc && !IFSC_RE.test(bankIfsc)) {
      errors.bank_ifsc = "Enter a valid IFSC (e.g. HDFC0001234).";
    }

    // Optional seller category — only accepted when it's a known value.
    // Omitted/blank keeps the existing value (DB default is 'field').
    const sellerCategory = trimmed(body.seller_category, 20);
    if (sellerCategory && !SELLER_CATEGORIES.includes(sellerCategory)) {
      errors.seller_category = "Category must be 'field' or 'independent'.";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({ error: "Please fix the highlighted fields.", fields: errors });
    }

    const row = {
      user_id: req.user.id, // always the session user — never from the body
      full_name: fullName,
      phone: phone.value,
      city: city || null,
      state: state || null,
      region: region || null,
      address: address || null,
      photo_url: photoUrl || null,
      bank_name: bankName || null,
      bank_account: bankAccount || null,
      bank_ifsc: bankIfsc || null,
      ...(sellerCategory ? { seller_category: sellerCategory } : {}),
    };

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .upsert(row, { onConflict: "user_id" })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      console.error("[field:profile:save]", error.message);
      return res.status(500).json({ error: "Could not save your profile." });
    }

    // Keep users.full_name in sync — the sidebar, JWT (on next login), and
    // /api/auth/me all read the name from the users table, not profiles.
    const { error: userSyncError } = await supabaseAdmin
      .from("users")
      .update({ full_name: fullName })
      .eq("id", req.user.id);
    if (userSyncError) {
      console.error("[field:profile:save] users sync:", userSyncError.message);
    }

    return res.json({ ok: true, profile: data });
  } catch (err) {
    console.error("[field:profile:save]", err.message);
    return res.status(500).json({ error: "Could not save your profile." });
  }
}

/* ------------------------------ catalogue ------------------------------ */

const PRODUCT_SORTS = {
  newest: { column: "created_at", ascending: false },
  price_low: { column: "price", ascending: true },
  price_high: { column: "price", ascending: false },
  rating: { column: "rating", ascending: false },
};

/**
 * GET /api/field/products — every LIVE product across all vendors.
 * Officers sell the whole marketplace catalogue, so this is not
 * owner-scoped — but it only ever exposes live, in-stock products.
 */
async function listProducts(req, res) {
  try {
    const page = clamp(req.query.page, 1, 100000, 1);
    const pageSize = clamp(req.query.page_size, 1, 50, 24);
    const from = (page - 1) * pageSize;

    let query = supabaseAdmin
      .from("products")
      .select(
        "id, name, brand, description, price, mrp, stock, images, rating, sku, created_at, categories(name)",
        { count: "exact" }
      )
      .eq("status", "live")
      .gt("stock", 0);

    const q = sanitizeSearch(trimmed(req.query.q, 120));
    if (q) {
      const term = `%${q}%`;
      query = query.or(`name.ilike.${term},brand.ilike.${term}`);
    }

    const sort = PRODUCT_SORTS[req.query.sort] ?? PRODUCT_SORTS.newest;
    query = query
      .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      .order("id", { ascending: true }) // stable tiebreaker for pagination
      .range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (error.code === "PGRST103") {
        return res.json({ products: [], total: count ?? 0, page, pageSize });
      }
      console.error("[field:products]", error.message);
      return res.status(500).json({ error: "Could not load the catalogue." });
    }

    const products = (data ?? []).map(({ categories, ...p }) => ({
      ...p,
      category: categories?.name ?? null,
    }));

    return res.json({ products, total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error("[field:products]", err.message);
    return res.status(500).json({ error: "Could not load the catalogue." });
  }
}

/* -------------------------------- orders ------------------------------- */

/**
 * POST /api/field/orders — place a customer order on the spot.
 * Body: { customer_name, customer_phone, city, state?, items: [{ product_id, qty }] }
 *
 * All pricing, stock checks, and commission maths happen inside the
 * place_field_order RPC in a single transaction with row locks.
 */
async function createOrder(req, res) {
  try {
    const body = req.body || {};
    const errors = {};

    const customerName = trimmed(body.customer_name, 200);
    if (customerName.length < 2 || customerName.length > 120) {
      errors.customer_name = "Customer name must be 2-120 characters.";
    }

    // A field order needs a reachable customer — phone is required here
    // even though the column is nullable (online orders don't collect it).
    const phone = normalizePhone(body.customer_phone);
    if (!String(body.customer_phone ?? "").trim()) {
      errors.customer_phone = "Customer phone is required.";
    } else if (!phone.ok) {
      errors.customer_phone = PHONE_ERROR;
    }

    const city = trimmed(body.city, 120);
    if (city.length < 2) errors.city = "Customer city is required.";
    const state = trimmed(body.state, 120);

    const rawItems = Array.isArray(body.items) ? body.items : null;
    if (!rawItems || rawItems.length === 0) {
      errors.items = "Add at least one product to the order.";
    } else if (rawItems.length > 20) {
      errors.items = "An order can have at most 20 line items.";
    }

    // Merge duplicate product lines and validate each entry.
    const merged = new Map();
    if (rawItems && !errors.items) {
      for (const item of rawItems) {
        const productId = String(item?.product_id ?? "").trim();
        const qty = Number(item?.qty);
        if (!UUID_RE.test(productId)) {
          errors.items = "One of the line items has an invalid product.";
          break;
        }
        if (!Number.isInteger(qty) || qty < 1 || qty > 10000) {
          errors.items = "Each quantity must be a whole number between 1 and 10,000.";
          break;
        }
        const next = (merged.get(productId) ?? 0) + qty;
        if (next > 10000) {
          errors.items = "Combined quantity per product cannot exceed 10,000.";
          break;
        }
        merged.set(productId, next);
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({ error: "Please fix the highlighted fields.", fields: errors });
    }

    const items = [...merged.entries()].map(([product_id, qty]) => ({ product_id, qty }));

    const { data, error } = await supabaseAdmin.rpc("place_field_order", {
      p_officer_id: req.user.id,
      p_customer_name: customerName,
      p_customer_phone: phone.value,
      p_city: city,
      p_state: state || null,
      p_items: items,
    });

    if (error) {
      const msg = String(error.message || "");
      const detail = msg.includes(":") ? msg.slice(msg.indexOf(":") + 1).trim() : null;
      if (msg.startsWith("FIELD_ORDER_STOCK")) {
        return res.status(409).json({ error: detail || "Not enough stock for one of the items." });
      }
      if (msg.startsWith("FIELD_ORDER_UNAVAILABLE")) {
        return res.status(409).json({ error: detail || "A product in this order is unavailable." });
      }
      if (msg.startsWith("FIELD_ORDER_INVALID")) {
        return res.status(422).json({ error: detail || "The order details are invalid." });
      }
      if (msg.startsWith("FIELD_ORDER_RETRY")) {
        return res.status(503).json({ error: detail || "Temporary hiccup — please try again." });
      }
      console.error("[field:orders:create]", msg);
      return res.status(500).json({ error: "Could not place the order." });
    }

    return res.status(201).json({ ok: true, ...data });
  } catch (err) {
    console.error("[field:orders:create]", err.message);
    return res.status(500).json({ error: "Could not place the order." });
  }
}

/** GET /api/field/orders — the officer's own field orders, newest first. */
async function listMyOrders(req, res) {
  try {
    const page = clamp(req.query.page, 1, 100000, 1);
    const pageSize = clamp(req.query.page_size, 1, 50, 10);
    const from = (page - 1) * pageSize;

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_no, product_name, customer_name, customer_phone, city, state, status, qty, unit_price, amount, placed_at",
        { count: "exact" }
      )
      .eq("officer_id", req.user.id);

    const statuses = trimmed(req.query.status, 120)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => ORDER_STATUSES.includes(s));
    if (statuses.length > 0) query = query.in("status", statuses);

    query = query
      .order("placed_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (error.code === "PGRST103") {
        return res.json({ orders: [], total: count ?? 0, page, pageSize });
      }
      console.error("[field:orders:list]", error.message);
      return res.status(500).json({ error: "Could not load your orders." });
    }
    return res.json({ orders: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error("[field:orders:list]", err.message);
    return res.status(500).json({ error: "Could not load your orders." });
  }
}

/* -------------------------- earnings & summary -------------------------- */

/**
 * GET /api/field/summary — month-to-date KPIs.
 *
 * Fast path: the officer_summary RPC (single round trip, computed in SQL).
 * Fallback: if the RPC is missing or references tables/columns the live
 * database doesn't have yet (unrun migration), compute the same shape here
 * from the core tables. visits/leads are OPTIONAL — if their tables don't
 * exist the counts degrade to 0 instead of killing the whole dashboard.
 */
const numOr0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function computeSummaryFallback(officerId) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [ordersRes, commRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("amount, qty, status")
      .eq("officer_id", officerId)
      .eq("channel", "field")
      .gte("placed_at", monthIso)
      .limit(5000),
    supabaseAdmin
      .from("commissions")
      .select("amount, status, created_at")
      .eq("officer_id", officerId)
      .limit(5000),
    supabaseAdmin
      .from("profiles")
      .select("region, monthly_target")
      .eq("user_id", officerId)
      .maybeSingle(),
  ]);

  // Orders are the core answer — a failure here is a real failure.
  if (ordersRes.error) throw new Error(ordersRes.error.message);
  // Commissions/profile degrade to zeros but are logged.
  if (commRes.error) console.error("[field:summary:comm]", commRes.error.message);
  if (profileRes.error) console.error("[field:summary:profile]", profileRes.error.message);

  const orders = (ordersRes.data ?? []).filter(
    (o) => o.status !== "cancelled" && o.status !== "returned"
  );
  const comms = commRes.data ?? [];
  const profile = profileRes.data ?? {};

  // Optional tables: tolerate "relation does not exist" (42P01) silently.
  let visitsToday = 0;
  let visitsPlanned = 0;
  try {
    const [visitsRes, leadsRes] = await Promise.all([
      supabaseAdmin
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("officer_id", officerId)
        .gte("visited_at", dayStart.toISOString()),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("officer_id", officerId),
    ]);
    if (!visitsRes.error) visitsToday = visitsRes.count ?? 0;
    if (!leadsRes.error) visitsPlanned = leadsRes.count ?? 0;
  } catch {
    /* optional data — never fatal */
  }

  return {
    sales_month: orders.reduce((s, o) => s + numOr0(o.amount), 0),
    units_month: orders.reduce((s, o) => s + numOr0(o.qty), 0),
    orders_month: orders.length,
    commission_pending: comms
      .filter((c) => c.status === "pending")
      .reduce((s, c) => s + numOr0(c.amount), 0),
    commission_settled: comms
      .filter((c) => c.status === "settled")
      .reduce((s, c) => s + numOr0(c.amount), 0),
    commission_month: comms
      .filter((c) => c.created_at && c.created_at >= monthIso)
      .reduce((s, c) => s + numOr0(c.amount), 0),
    visits_today: visitsToday,
    visits_planned: visitsPlanned,
    monthly_target: numOr0(profile.monthly_target) || 350000,
    region: profile.region ?? null,
    region_rank: null, // rank needs the SQL window fn — omitted in fallback
    region_officers: 0,
  };
}

async function getSummary(req, res) {
  try {
    const { data, error } = await supabaseAdmin.rpc("officer_summary", {
      p_officer_id: req.user.id,
    });
    if (!error && data) return res.json(data);
    if (error) {
      // RPC missing or schema drift — log loudly, then self-heal.
      console.error("[field:summary:rpc]", error.message, "— using fallback");
    }
    const summary = await computeSummaryFallback(req.user.id);
    return res.json(summary);
  } catch (err) {
    console.error("[field:summary]", err.message);
    return res.status(500).json({ error: "Could not load your summary." });
  }
}

/**
 * GET /api/field/performance?range=daily|monthly&span=N
 * daily: last N days (7-90, default 14) · monthly: last N months (1-24, default 6)
 */
async function getPerformance(req, res) {
  try {
    const range = req.query.range === "monthly" ? "monthly" : "daily";

    if (range === "monthly") {
      const span = clamp(req.query.span, 1, 24, 6);
      const { data, error } = await supabaseAdmin.rpc("officer_perf_monthly", {
        p_officer_id: req.user.id,
        p_months: span,
      });
      if (error) {
        console.error("[field:performance]", error.message);
        return res.status(500).json({ error: "Could not load performance data." });
      }
      return res.json({ range, span, points: data ?? [] });
    }

    const span = clamp(req.query.span, 7, 90, 14);
    const { data, error } = await supabaseAdmin.rpc("officer_perf_daily", {
      p_officer_id: req.user.id,
      p_days: span,
    });
    if (error) {
      console.error("[field:performance]", error.message);
      return res.status(500).json({ error: "Could not load performance data." });
    }
    return res.json({ range, span, points: data ?? [] });
  } catch (err) {
    console.error("[field:performance]", err.message);
    return res.status(500).json({ error: "Could not load performance data." });
  }
}

/** GET /api/field/commissions?status=&page=&page_size= — commission ledger. */
async function listCommissions(req, res) {
  try {
    const page = clamp(req.query.page, 1, 100000, 1);
    const pageSize = clamp(req.query.page_size, 1, 50, 10);
    const from = (page - 1) * pageSize;

    let query = supabaseAdmin
      .from("commissions")
      .select(
        "id, rate, amount, status, settled_at, created_at, orders(order_no, product_name, customer_name, qty, amount, placed_at)",
        { count: "exact" }
      )
      .eq("officer_id", req.user.id);

    const status = trimmed(req.query.status, 20);
    if (COMMISSION_STATUSES.includes(status)) query = query.eq("status", status);

    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (error.code === "PGRST103") {
        return res.json({ commissions: [], total: count ?? 0, page, pageSize });
      }
      console.error("[field:commissions]", error.message);
      return res.status(500).json({ error: "Could not load your commissions." });
    }

    const commissions = (data ?? []).map(({ orders, ...c }) => ({
      ...c,
      order_no: orders?.order_no ?? null,
      product_name: orders?.product_name ?? null,
      customer_name: orders?.customer_name ?? null,
      qty: orders?.qty ?? null,
      order_amount: orders?.amount ?? null,
      placed_at: orders?.placed_at ?? null,
    }));

    return res.json({ commissions, total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error("[field:commissions]", err.message);
    return res.status(500).json({ error: "Could not load your commissions." });
  }
}

/** GET /api/field/leaderboard?region= — month leaderboard (all officers). */
async function getLeaderboard(req, res) {
  try {
    const region = trimmed(req.query.region, 20);
    const { data, error } = await supabaseAdmin.rpc("officer_leaderboard", {
      p_region: REGIONS.includes(region) ? region : null,
    });
    if (error) {
      console.error("[field:leaderboard]", error.message);
      return res.status(500).json({ error: "Could not load the leaderboard." });
    }
    return res.json({ leaderboard: data ?? [] });
  } catch (err) {
    console.error("[field:leaderboard]", err.message);
    return res.status(500).json({ error: "Could not load the leaderboard." });
  }
}

module.exports = {
  getProfile,
  upsertProfile,
  listProducts,
  createOrder,
  listMyOrders,
  getSummary,
  getPerformance,
  listCommissions,
  getLeaderboard,
};
