const { supabaseAdmin } = require("../config/supabase");

/**
 * OVERVIEW — live dashboard data for the Admin and Client portals.
 *
 * All heavy aggregation runs inside Postgres via the SECURITY DEFINER
 * functions in db/portal-schema.sql (admin_summary, admin_revenue_by_month,
 * admin_region_stats, admin_clients_overview, admin_officers_overview).
 * Those functions have EXECUTE revoked from anon/authenticated — only the
 * service-role backend can call them, and every route here sits behind
 * requireAuth + requireRole.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** % change with divide-by-zero safety. */
function growth(current, previous) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/* ------------------------------------------------------------------ */
/* GET /api/admin/overview                                             */
/* ------------------------------------------------------------------ */
async function adminOverview(req, res) {
  try {
    const [summaryRes, trendRes, regionsRes, ordersRes] = await Promise.all([
      supabaseAdmin.rpc("admin_summary"),
      supabaseAdmin.rpc("admin_revenue_by_month", { p_months: 7 }),
      supabaseAdmin.rpc("admin_region_stats"),
      supabaseAdmin
        .from("orders")
        .select(
          "id, order_no, product_name, customer_name, city, channel, status, amount, officer_name, placed_at"
        )
        .order("placed_at", { ascending: false })
        .limit(6),
    ]);

    // The summary is the backbone of the page — fail loudly if it breaks.
    if (summaryRes.error) {
      console.error("[admin:overview:summary]", summaryRes.error.message);
      return res.status(500).json({ error: "Could not load overview." });
    }
    // Trend / regions / orders degrade gracefully to empty lists.
    if (trendRes.error) console.error("[admin:overview:trend]", trendRes.error.message);
    if (regionsRes.error) console.error("[admin:overview:regions]", regionsRes.error.message);
    if (ordersRes.error) console.error("[admin:overview:orders]", ordersRes.error.message);

    const s = summaryRes.data ?? {};
    const trend = (trendRes.data ?? []).map((r) => ({
      month: r.month,
      revenue: num(r.revenue),
      orders: num(r.orders),
      fieldShare: num(r.field_share),
    }));
    // Growth for the GMV card: last full month vs the one before it.
    const prev = trend.length >= 2 ? trend[trend.length - 2].revenue : 0;
    const curr = trend.length >= 1 ? trend[trend.length - 1].revenue : 0;

    return res.json({
      kpis: {
        gmv: num(s.revenue_total),
        gmvGrowth: growth(curr, prev),
        revenueMonth: num(s.revenue_month),
        activeOfficers: num(s.officers),
        liveClients: num(s.clients),
        productsLive: num(s.products_live),
        productsReview: num(s.products_review),
        ordersTotal: num(s.orders_total),
        ordersToday: num(s.orders_today),
        commissionsPending: num(s.commissions_pending),
        commissionsSettled: num(s.commissions_settled),
      },
      trend,
      regions: (regionsRes.data ?? []).map((r) => ({
        region: r.region,
        sales: num(r.sales),
        officers: num(r.officers),
        growth: num(r.growth),
      })),
      recentOrders: ordersRes.data ?? [],
    });
  } catch (err) {
    console.error("[admin:overview]", err.message);
    return res.status(500).json({ error: "Could not load overview." });
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/admin/clients-overview                                     */
/* ------------------------------------------------------------------ */
async function adminClients(req, res) {
  try {
    const { data, error } = await supabaseAdmin.rpc("admin_clients_overview");
    if (error) {
      console.error("[admin:clients]", error.message);
      return res.status(500).json({ error: "Could not load clients." });
    }
    return res.json({
      clients: (data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        joinedAt: c.joined_at,
        productsLive: num(c.products_live),
        productsTotal: num(c.products_total),
        gmv: num(c.gmv),
        orders: num(c.orders),
      })),
    });
  } catch (err) {
    console.error("[admin:clients]", err.message);
    return res.status(500).json({ error: "Could not load clients." });
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/admin/officers-overview                                    */
/* ------------------------------------------------------------------ */
async function adminOfficers(req, res) {
  try {
    const [officersRes, regionsRes] = await Promise.all([
      supabaseAdmin.rpc("admin_officers_overview"),
      supabaseAdmin.rpc("admin_region_stats"),
    ]);
    if (officersRes.error) {
      console.error("[admin:officers]", officersRes.error.message);
      return res.status(500).json({ error: "Could not load officers." });
    }
    if (regionsRes.error) console.error("[admin:officers:regions]", regionsRes.error.message);

    return res.json({
      officers: (officersRes.data ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        email: o.email,
        city: o.city,
        region: o.region,
        joinedAt: o.joined_at,
        salesMonth: num(o.sales_month),
        unitsMonth: num(o.units_month),
        ordersMonth: num(o.orders_month),
        commissionPending: num(o.commission_pending),
        lastSaleAt: o.last_sale_at,
      })),
      regions: (regionsRes.data ?? []).map((r) => ({
        region: r.region,
        sales: num(r.sales),
        officers: num(r.officers),
        growth: num(r.growth),
      })),
    });
  } catch (err) {
    console.error("[admin:officers]", err.message);
    return res.status(500).json({ error: "Could not load officers." });
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/client/overview — scoped to req.user.id, never a param     */
/* ------------------------------------------------------------------ */
async function clientOverview(req, res) {
  try {
    const clientId = req.user.id; // from the verified JWT only
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [ordersRes, productsRes] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select(
          "id, order_no, product_name, customer_name, city, channel, status, qty, amount, officer_id, officer_name, placed_at"
        )
        .eq("client_id", clientId)
        .gte("placed_at", yearStart.toISOString())
        .order("placed_at", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("products")
        .select("id, status")
        .eq("owner_id", clientId)
        .limit(2000),
    ]);

    if (ordersRes.error) {
      console.error("[client:overview:orders]", ordersRes.error.message);
      return res.status(500).json({ error: "Could not load your dashboard." });
    }
    if (productsRes.error) console.error("[client:overview:products]", productsRes.error.message);

    const orders = ordersRes.data ?? [];
    const good = (o) => o.status !== "cancelled" && o.status !== "returned";

    let revMonth = 0, revPrev = 0, unitsMonth = 0, unitsPrev = 0, pendingOrders = 0;
    const monthly = new Map(); // "Jan" -> revenue
    for (const o of orders) {
      const at = new Date(o.placed_at);
      if (o.status === "processing" || o.status === "in-transit") pendingOrders++;
      if (!good(o)) continue;
      const key = at.toLocaleString("en-IN", { month: "short" });
      monthly.set(key, (monthly.get(key) ?? 0) + num(o.amount));
      if (at >= monthStart) { revMonth += num(o.amount); unitsMonth += num(o.qty); }
      else if (at >= prevMonthStart) { revPrev += num(o.amount); unitsPrev += num(o.qty); }
    }

    // Trend: every month of this year up to now, zero-filled.
    const trend = [];
    for (let m = 0; m <= now.getMonth(); m++) {
      const label = new Date(now.getFullYear(), m, 1)
        .toLocaleString("en-IN", { month: "short" });
      trend.push({ label, value: Math.round((monthly.get(label) ?? 0) / 1000) });
    }

    const products = productsRes.data ?? [];

    // Field performance for THIS client's products (leaderboard).
    const byOfficer = new Map();
    for (const o of orders) {
      if (o.channel !== "field" || !good(o) || !o.officer_name) continue;
      const cur = byOfficer.get(o.officer_name) ?? { sales: 0, units: 0, orders: 0 };
      cur.sales += num(o.amount);
      cur.units += num(o.qty);
      cur.orders += 1;
      byOfficer.set(o.officer_name, cur);
    }
    const officerBoard = [...byOfficer.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10)
      .map((o, i) => ({ ...o, rank: i + 1 }));

    // Bestsellers: top products by revenue across the year's good orders.
    const byProduct = new Map();
    for (const o of orders) {
      if (!good(o)) continue;
      const cur = byProduct.get(o.product_name) ?? { revenue: 0, units: 0 };
      cur.revenue += num(o.amount);
      cur.units += num(o.qty);
      byProduct.set(o.product_name, cur);
    }
    const topProducts = [...byProduct.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);

    const fieldOrders = orders.filter((o) => o.channel === "field").slice(0, 8);
    const fieldRevenue = officerBoard.reduce((s, o) => s + o.sales, 0);
    const fieldUnits = officerBoard.reduce((s, o) => s + o.units, 0);

    return res.json({
      kpis: {
        revenueMonth: revMonth,
        revenueGrowth: growth(revMonth, revPrev),
        unitsMonth,
        unitsGrowth: growth(unitsMonth, unitsPrev),
        liveProducts: products.filter((p) => p.status === "live").length,
        totalProducts: products.length,
        pendingOrders,
      },
      trend,
      topProducts,
      recentOrders: orders.slice(0, 5).map(({ officer_id, ...o }) => o),
      field: {
        revenue: fieldRevenue,
        units: fieldUnits,
        officers: officerBoard,
        recentOrders: fieldOrders.map(({ officer_id, ...o }) => o),
      },
    });
  } catch (err) {
    console.error("[client:overview]", err.message);
    return res.status(500).json({ error: "Could not load your dashboard." });
  }
}

module.exports = { adminOverview, adminClients, adminOfficers, clientOverview };
