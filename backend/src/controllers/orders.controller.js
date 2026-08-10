const { supabaseAdmin } = require("../config/supabase");

const ORDER_STATUSES = [
  "processing",
  "packed",
  "in-transit",
  "delivered",
  "cancelled",
  "returned",
];
const CHANNELS = ["field", "online"];
const SORTS = {
  newest: { column: "placed_at", ascending: false },
  oldest: { column: "placed_at", ascending: true },
  amount_high: { column: "amount", ascending: false },
  amount_low: { column: "amount", ascending: true },
};

const clamp = (n, min, max, fallback) => {
  const v = Number.parseInt(n, 10);
  if (Number.isNaN(v)) return fallback;
  return Math.min(Math.max(v, min), max);
};

// Sanitize a free-text search term for use inside a PostgREST `or=` filter.
// Whitelist approach: order numbers, product names, people, and cities only
// ever contain letters, digits, spaces, hyphens, ampersands, and plus signs.
// Everything else (quotes, parens, commas, dots, semicolons, backslashes,
// LIKE wildcards…) is grammar for PostgREST/SQL and gets stripped, which
// makes crafted input inert instead of a 500.
const sanitizeSearch = (s) =>
  s
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * GET /api/orders
 * Query params: q, status, channel, sort, date_from, date_to,
 *               min_amount, max_amount, page, page_size
 * Scoped to the authenticated client (req.user.id) — never trust a
 * client_id from the request.
 */
async function listOrders(req, res) {
  try {
    const page = clamp(req.query.page, 1, 100000, 1);
    const pageSize = clamp(req.query.page_size, 1, 100, 20);
    const from = (page - 1) * pageSize;

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_no, product_name, customer_name, city, state, channel, status, qty, unit_price, amount, placed_at, officer_name, products(images)",
        { count: "exact" }
      )
      .eq("client_id", req.user.id);

    // --- Free-text search across order number, product, customer, city
    const q = sanitizeSearch((req.query.q ?? "").toString().slice(0, 120));
    if (q) {
      const term = `%${q}%`;
      query = query.or(
        `order_no.ilike.${term},product_name.ilike.${term},customer_name.ilike.${term},city.ilike.${term},officer_name.ilike.${term}`
      );
    }

    // --- Status filter (multi: ?status=delivered,in-transit)
    const statuses = (req.query.status ?? "")
      .toString()
      .split(",")
      .map((s) => s.trim())
      .filter((s) => ORDER_STATUSES.includes(s));
    if (statuses.length > 0) query = query.in("status", statuses);

    // --- Channel filter
    const channel = (req.query.channel ?? "").toString().trim();
    if (CHANNELS.includes(channel)) query = query.eq("channel", channel);

    // --- Date range (ISO dates; invalid values are ignored, not fatal)
    const dateFrom = new Date(req.query.date_from ?? "");
    if (!Number.isNaN(dateFrom.getTime())) {
      query = query.gte("placed_at", dateFrom.toISOString());
    }
    const dateTo = new Date(req.query.date_to ?? "");
    if (!Number.isNaN(dateTo.getTime())) {
      // Make the end date inclusive (end of that day).
      dateTo.setHours(23, 59, 59, 999);
      query = query.lte("placed_at", dateTo.toISOString());
    }

    // --- Amount range
    const minAmount = Number.parseFloat(req.query.min_amount);
    if (!Number.isNaN(minAmount) && minAmount >= 0) {
      query = query.gte("amount", minAmount);
    }
    const maxAmount = Number.parseFloat(req.query.max_amount);
    if (!Number.isNaN(maxAmount) && maxAmount >= 0) {
      query = query.lte("amount", maxAmount);
    }

    // --- Sort
    const sort = SORTS[req.query.sort] ?? SORTS.newest;
    query = query
      .order(sort.column, { ascending: sort.ascending })
      .order("id", { ascending: true }) // stable tiebreaker for pagination
      .range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      // Requesting a page beyond the last one is not an error to the user.
      if (error.code === "PGRST103") {
        return res.json({ orders: [], total: count ?? 0, page, pageSize });
      }
      console.error("[orders:list]", error.message);
      return res.status(500).json({ error: "Could not load orders." });
    }

    // Flatten the joined product row into a single image URL.
    const orders = (data ?? []).map(({ products, ...o }) => ({
      ...o,
      product_image: Array.isArray(products?.images)
        ? (products.images[0] ?? null)
        : null,
    }));

    return res.json({ orders, total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error("[orders:list]", err.message);
    return res.status(500).json({ error: "Could not load orders." });
  }
}

/**
 * GET /api/orders/summary — aggregate stats for the header cards.
 */
async function orderSummary(req, res) {
  try {
    const { data, error } = await supabaseAdmin.rpc("orders_summary", {
      p_client_id: req.user.id,
    });
    if (error) {
      console.error("[orders:summary]", error.message);
      return res.status(500).json({ error: "Could not load summary." });
    }
    return res.json(data);
  } catch (err) {
    console.error("[orders:summary]", err.message);
    return res.status(500).json({ error: "Could not load summary." });
  }
}

/**
 * PATCH /api/orders/:id — cancel an order (the only mutation a client
 * may perform, and only while the order is still cancellable).
 */
async function updateOrder(req, res) {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: "Invalid order id." });
    }

    const action = (req.body?.action ?? "").toString();
    if (action !== "cancel") {
      return res.status(400).json({ error: "Unsupported action." });
    }

    // Fetch first so we can give a precise error instead of a silent no-op.
    const { data: order, error: findErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, client_id")
      .eq("id", id)
      .single();

    if (findErr || !order || order.client_id !== req.user.id) {
      // Same response whether it doesn't exist or belongs to someone else —
      // never leak other tenants' order ids.
      return res.status(404).json({ error: "Order not found." });
    }

    const CANCELLABLE = ["processing", "packed"];
    if (!CANCELLABLE.includes(order.status)) {
      return res.status(409).json({
        error: `This order is already ${order.status} and can no longer be cancelled.`,
      });
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("client_id", req.user.id)
      .in("status", CANCELLABLE) // guards against a race with fulfilment
      .select("id, status")
      .single();

    if (updErr || !updated) {
      return res
        .status(409)
        .json({ error: "Order state changed — refresh and try again." });
    }

    return res.json({ ok: true, order: updated });
  } catch (err) {
    console.error("[orders:update]", err.message);
    return res.status(500).json({ error: "Could not update the order." });
  }
}

module.exports = { listOrders, orderSummary, updateOrder };
