// MySQL ports of the Postgres RPC functions the controllers call via
// supabaseAdmin.rpc(name, args). Each returns { data, error } like supabase-js.
const crypto = require("crypto");
const { pool } = require("./db");
const { syncWallet } = require("../services/wallet");

const MONTH_START = "DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')";
const DAY_START = "UTC_DATE()";

function ok(data) { return { data, error: null }; }
function fail(message) { return { data: null, error: { message } }; }

function displayNameSql(alias) {
  return `COALESCE(NULLIF(${alias}.full_name, ''), SUBSTRING_INDEX(${alias}.email, '@', 1))`;
}

function toISO(v) { return v instanceof Date ? v.toISOString() : v; }
function rowOut(row) {
  const o = {};
  for (const k of Object.keys(row)) o[k] = toISO(row[k]);
  return o;
}

// ---------- user_names({ p_ids })
async function user_names({ p_ids }) {
  const ids = Array.isArray(p_ids) ? p_ids.filter(Boolean) : [];
  if (!ids.length) return ok([]);
  const [rows] = await pool.query(
    `SELECT id, ${displayNameSql("u")} AS name FROM users u WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  return ok(rows);
}

// ---------- admin_user_ids()
async function admin_user_ids() {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE role = 'admin' AND email_confirmed_at IS NOT NULL"
  );
  return ok(rows.map((r) => r.id));
}

// ---------- chat_bump_thread({...})
async function chat_bump_thread({ p_thread_id, p_last_message, p_last_message_at, p_bump_admin, p_participant_name }) {
  await pool.query(
    `UPDATE chat_threads SET
       last_message = ?,
       last_message_at = ?,
       unread_for_admin = unread_for_admin + IF(?, 1, 0),
       unread_for_participant = unread_for_participant + IF(?, 0, 1),
       participant_name = COALESCE(NULLIF(TRIM(?), ''), participant_name)
     WHERE id = ?`,
    [
      p_last_message,
      p_last_message_at ? new Date(p_last_message_at) : new Date(),
      p_bump_admin ? 1 : 0,
      p_bump_admin ? 1 : 0,
      p_participant_name ?? "",
      p_thread_id,
    ]
  );
  return ok(null);
}

// ---------- commission_summary_admin()
async function commission_summary_admin() {
  const [rows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending'   THEN amount END), 0) AS pending,
       COALESCE(SUM(CASE WHEN status = 'available' THEN amount END), 0) AS available,
       COALESCE(SUM(CASE WHEN status = 'settled'   THEN amount END), 0) AS settled,
       COALESCE(SUM(amount), 0) AS total
     FROM commissions`
  );
  return ok(rows); // controller reads data?.[0]
}

// ---------- orders_summary({ p_client_id })
async function orders_summary({ p_client_id }) {
  const [rows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN amount END), 0) AS total_amount,
       COUNT(*) AS total_orders,
       CASE WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(100.0 * SUM(channel = 'field') / COUNT(*)) END AS field_share,
       SUM(status = 'delivered') AS delivered,
       SUM(status IN ('in-transit','packed','processing')) AS in_transit,
       SUM(status IN ('returned','cancelled')) AS returned
     FROM orders WHERE client_id = ?`,
    [p_client_id]
  );
  const r = rows[0];
  return ok({
    total_amount: Number(r.total_amount),
    total_orders: Number(r.total_orders),
    field_share: Number(r.field_share),
    delivered: Number(r.delivered) || 0,
    in_transit: Number(r.in_transit) || 0,
    returned: Number(r.returned) || 0,
  });
}

// ---------- officer_summary({ p_officer_id })
async function officer_summary({ p_officer_id }) {
  const id = p_officer_id;
  const [[mo]] = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS sales, COALESCE(SUM(qty),0) AS units, COUNT(*) AS orders
     FROM orders
     WHERE officer_id = ? AND channel = 'field'
       AND status NOT IN ('cancelled','returned')
       AND placed_at >= ${MONTH_START}`,
    [id]
  );
  const [[comm]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END),0) AS pending,
       COALESCE(SUM(CASE WHEN status = 'settled' THEN amount END),0) AS settled,
       COALESCE(SUM(CASE WHEN created_at >= ${MONTH_START} THEN amount END),0) AS month
     FROM commissions WHERE officer_id = ?`,
    [id]
  );
  const [[vis]] = await pool.query(
    `SELECT COUNT(*) AS today FROM visits WHERE officer_id = ? AND visited_at >= ${DAY_START}`,
    [id]
  );
  const [[planned]] = await pool.query(
    `SELECT COUNT(*) AS n FROM leads WHERE officer_id = ?`,
    [id]
  );
  const [meRows] = await pool.query(
    `SELECT region, monthly_target FROM profiles WHERE user_id = ?`,
    [id]
  );
  const me = meRows[0] || {};

  let region_rank = null;
  let region_officers = 0;
  if (me.region) {
    const [rows] = await pool.query(
      `SELECT p.user_id, COALESCE(SUM(CASE
           WHEN o.channel = 'field' AND o.status NOT IN ('cancelled','returned')
                AND o.placed_at >= ${MONTH_START} THEN o.amount END), 0) AS sales
       FROM profiles p
       LEFT JOIN orders o ON o.officer_id = p.user_id
       WHERE p.region = ?
       GROUP BY p.user_id
       ORDER BY sales DESC`,
      [me.region]
    );
    region_officers = rows.length;
    const idx = rows.findIndex((r) => r.user_id === id);
    region_rank = idx >= 0 ? idx + 1 : null;
  }

  return ok({
    sales_month: Number(mo.sales),
    units_month: Number(mo.units),
    orders_month: Number(mo.orders),
    commission_pending: Number(comm.pending),
    commission_settled: Number(comm.settled),
    commission_month: Number(comm.month),
    visits_today: Number(vis.today),
    visits_planned: Number(planned.n),
    monthly_target: Number(me.monthly_target ?? 350000),
    region: me.region ?? null,
    region_rank,
    region_officers,
  });
}

// ---------- officer_perf_daily({ p_officer_id, p_days })
async function officer_perf_daily({ p_officer_id, p_days }) {
  const days = Math.max(1, Math.min(Number(p_days) || 14, 90));
  const [rows] = await pool.query(
    `SELECT DATE(o.placed_at) AS day, COUNT(*) AS orders, COALESCE(SUM(o.qty),0) AS units,
            COALESCE(SUM(o.amount),0) AS revenue, COALESCE(SUM(c.amount),0) AS commission
     FROM orders o
     LEFT JOIN commissions c ON c.order_id = o.id
     WHERE o.officer_id = ? AND o.channel = 'field'
       AND o.status NOT IN ('cancelled','returned')
       AND o.placed_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY DATE(o.placed_at)`,
    [p_officer_id, days]
  );
  const byDay = {};
  for (const r of rows) {
    const key = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day);
    byDay[key] = r;
  }
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    const r = byDay[key];
    out.push({
      day: key,
      orders: r ? Number(r.orders) : 0,
      units: r ? Number(r.units) : 0,
      revenue: r ? Number(r.revenue) : 0,
      commission: r ? Number(r.commission) : 0,
    });
  }
  return ok(out);
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthSeries(months) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ key: d.toISOString().slice(0, 7), label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
  }
  return out;
}

// ---------- officer_perf_monthly({ p_officer_id, p_months })
async function officer_perf_monthly({ p_officer_id, p_months }) {
  const months = Math.max(1, Math.min(Number(p_months) || 6, 24));
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(o.placed_at, '%Y-%m') AS m, COUNT(*) AS orders, COALESCE(SUM(o.qty),0) AS units,
            COALESCE(SUM(o.amount),0) AS revenue, COALESCE(SUM(c.amount),0) AS commission
     FROM orders o
     LEFT JOIN commissions c ON c.order_id = o.id
     WHERE o.officer_id = ? AND o.channel = 'field'
       AND o.status NOT IN ('cancelled','returned')
       AND o.placed_at >= DATE_SUB(${MONTH_START}, INTERVAL ? MONTH)
     GROUP BY DATE_FORMAT(o.placed_at, '%Y-%m')`,
    [p_officer_id, months - 1]
  );
  const byM = Object.fromEntries(rows.map((r) => [r.m, r]));
  const out = monthSeries(months).map(({ key, label }) => {
    const r = byM[key];
    return {
      month: label,
      orders: r ? Number(r.orders) : 0,
      units: r ? Number(r.units) : 0,
      revenue: r ? Number(r.revenue) : 0,
      commission: r ? Number(r.commission) : 0,
    };
  });
  return ok(out);
}

// ---------- officer_leaderboard({ p_region })
async function officer_leaderboard(args = {}) {
  const region = args.p_region ?? null;
  const params = [];
  let where = "";
  if (region) { where = "WHERE p.region = ?"; params.push(region); }
  const [rows] = await pool.query(
    `SELECT p.user_id AS officer_id, p.full_name AS name, p.city, p.region,
            COALESCE(SUM(CASE WHEN o.channel = 'field' AND o.status NOT IN ('cancelled','returned')
                 AND o.placed_at >= ${MONTH_START} THEN o.amount END), 0) AS sales,
            COALESCE(SUM(CASE WHEN o.channel = 'field' AND o.status NOT IN ('cancelled','returned')
                 AND o.placed_at >= ${MONTH_START} THEN o.qty END), 0) AS units
     FROM profiles p
     LEFT JOIN orders o ON o.officer_id = p.user_id
     ${where}
     GROUP BY p.user_id, p.full_name, p.city, p.region
     ORDER BY sales DESC
     LIMIT 50`,
    params
  );
  return ok(rows.map((r, i) => ({ ...rowOut(r), sales: Number(r.sales), units: Number(r.units), rank: i + 1 })));
}

// ---------- admin_summary()
async function admin_summary() {
  const [[u]] = await pool.query(
    `SELECT
       SUM(role = 'client' AND email_confirmed_at IS NOT NULL) AS clients,
       SUM(role = 'field'  AND email_confirmed_at IS NOT NULL) AS officers
     FROM users`
  );
  const [[p]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(status = 'live') AS live, SUM(status = 'review') AS review FROM products`
  );
  const [[o]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(placed_at >= ${DAY_START}) AS today,
            COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN amount END), 0) AS revenue_total,
            COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') AND placed_at >= ${MONTH_START} THEN amount END), 0) AS revenue_month
     FROM orders`
  );
  const [[c]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) AS pending,
            COALESCE(SUM(CASE WHEN status = 'settled' THEN amount END), 0) AS settled
     FROM commissions`
  );
  return ok({
    clients: Number(u.clients) || 0,
    officers: Number(u.officers) || 0,
    products_total: Number(p.total) || 0,
    products_live: Number(p.live) || 0,
    products_review: Number(p.review) || 0,
    orders_total: Number(o.total) || 0,
    orders_today: Number(o.today) || 0,
    revenue_total: Number(o.revenue_total) || 0,
    revenue_month: Number(o.revenue_month) || 0,
    commissions_pending: Number(c.pending) || 0,
    commissions_settled: Number(c.settled) || 0,
  });
}

// ---------- admin_clients_overview()
async function admin_clients_overview() {
  const [rows] = await pool.query(
    `SELECT u.id,
            ${displayNameSql("u")} AS name,
            u.email,
            u.created_at AS joined_at,
            COALESCE(p.live, 0) AS products_live,
            COALESCE(p.total, 0) AS products_total,
            COALESCE(o.gmv, 0) AS gmv,
            COALESCE(o.orders, 0) AS orders
     FROM users u
     LEFT JOIN (
       SELECT owner_id, SUM(status = 'live') AS live, COUNT(*) AS total
       FROM products GROUP BY owner_id
     ) p ON p.owner_id = u.id
     LEFT JOIN (
       SELECT client_id,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN amount END), 0) AS gmv,
              COUNT(*) AS orders
       FROM orders GROUP BY client_id
     ) o ON o.client_id = u.id
     WHERE u.role = 'client' AND u.email_confirmed_at IS NOT NULL
     ORDER BY COALESCE(o.gmv, 0) DESC`
  );
  return ok(rows.map((r) => ({ ...rowOut(r), gmv: Number(r.gmv), products_live: Number(r.products_live), products_total: Number(r.products_total), orders: Number(r.orders) })));
}

// ---------- admin_officers_overview()
async function admin_officers_overview() {
  const [rows] = await pool.query(
    `SELECT u.id,
            COALESCE(NULLIF(pr.full_name, ''), ${displayNameSql("u")}) AS name,
            u.email,
            pr.city,
            pr.region,
            COALESCE(pr.joined_at, u.created_at) AS joined_at,
            COALESCE(o.sales, 0) AS sales_month,
            COALESCE(o.units, 0) AS units_month,
            COALESCE(o.orders, 0) AS orders_month,
            COALESCE(c.pending, 0) AS commission_pending,
            o.last_sale_at
     FROM users u
     LEFT JOIN profiles pr ON pr.user_id = u.id
     LEFT JOIN (
       SELECT officer_id,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') AND placed_at >= ${MONTH_START} THEN amount END), 0) AS sales,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') AND placed_at >= ${MONTH_START} THEN qty END), 0) AS units,
              SUM(status NOT IN ('cancelled','returned') AND placed_at >= ${MONTH_START}) AS orders,
              MAX(placed_at) AS last_sale_at
       FROM orders WHERE officer_id IS NOT NULL GROUP BY officer_id
     ) o ON o.officer_id = u.id
     LEFT JOIN (
       SELECT officer_id, SUM(amount) AS pending FROM commissions WHERE status = 'pending' GROUP BY officer_id
     ) c ON c.officer_id = u.id
     WHERE u.role = 'field' AND u.email_confirmed_at IS NOT NULL
     ORDER BY COALESCE(o.sales, 0) DESC`
  );
  return ok(rows.map((r) => ({ ...rowOut(r), sales_month: Number(r.sales_month), units_month: Number(r.units_month), orders_month: Number(r.orders_month), commission_pending: Number(r.commission_pending) })));
}

// ---------- admin_revenue_by_month({ p_months })
async function admin_revenue_by_month({ p_months }) {
  const months = Math.max(1, Math.min(Number(p_months) || 7, 24));
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(placed_at, '%Y-%m') AS m,
            COALESCE(SUM(amount), 0) AS revenue,
            COUNT(*) AS orders,
            ROUND(100.0 * SUM(channel = 'field') / COUNT(*)) AS field_share
     FROM orders
     WHERE status NOT IN ('cancelled','returned')
       AND placed_at >= DATE_SUB(${MONTH_START}, INTERVAL ? MONTH)
     GROUP BY DATE_FORMAT(placed_at, '%Y-%m')`,
    [months - 1]
  );
  const byM = Object.fromEntries(rows.map((r) => [r.m, r]));
  return ok(monthSeries(months).map(({ key, label }) => {
    const r = byM[key];
    return {
      month: label,
      revenue: r ? Number(r.revenue) : 0,
      orders: r ? Number(r.orders) : 0,
      field_share: r ? Number(r.field_share) : 0,
    };
  }));
}

// ---------- admin_region_stats()
async function admin_region_stats() {
  const [rows] = await pool.query(
    `SELECT p.region,
            COUNT(DISTINCT p.user_id) AS officers,
            COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','returned')
                 AND o.placed_at >= ${MONTH_START} THEN o.amount END), 0) AS this_month,
            COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','returned')
                 AND o.placed_at >= DATE_SUB(${MONTH_START}, INTERVAL 1 MONTH)
                 AND o.placed_at < ${MONTH_START} THEN o.amount END), 0) AS prev_month
     FROM profiles p
     LEFT JOIN orders o ON o.officer_id = p.user_id AND o.channel = 'field'
     WHERE p.region IS NOT NULL
     GROUP BY p.region
     ORDER BY this_month DESC`
  );
  return ok(rows.map((r) => ({
    region: r.region,
    sales: Number(r.this_month),
    officers: Number(r.officers),
    growth: Number(r.prev_month) === 0 ? 0 : Math.round((1000 * (Number(r.this_month) - Number(r.prev_month))) / Number(r.prev_month)) / 10,
  })));
}

// ---------- place_field_order({...}) — transactional, row-locked
async function place_field_order({ p_officer_id, p_customer_name, p_customer_phone, p_city, p_state, p_items }) {
  const items = typeof p_items === "string" ? JSON.parse(p_items) : p_items;
  if (!p_customer_name || String(p_customer_name).trim().length < 2) {
    return fail("FIELD_ORDER_INVALID:Customer name is required.");
  }
  if (!p_city || String(p_city).trim().length < 2) {
    return fail("FIELD_ORDER_INVALID:Customer city is required.");
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    return fail("FIELD_ORDER_INVALID:An order needs between 1 and 20 line items.");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orows] = await conn.query(
      `SELECT COALESCE(NULLIF(pr.full_name, ''), NULLIF(u.full_name, ''), SUBSTRING_INDEX(u.email, '@', 1)) AS name
       FROM users u LEFT JOIN profiles pr ON pr.user_id = u.id WHERE u.id = ?`,
      [p_officer_id]
    );
    const officer = orows[0];
    if (!officer || !officer.name) {
      await conn.rollback();
      return fail("FIELD_ORDER_INVALID:Officer account not found.");
    }

    const rate = 0.08;
    let total = 0;
    let totalComm = 0;
    const outOrders = [];

    for (const item of items) {
      const productId = item?.product_id;
      const qty = Number(item?.qty);
      if (!productId) { await conn.rollback(); return fail("FIELD_ORDER_INVALID:Each line item needs a product."); }
      if (!Number.isInteger(qty) || qty < 1 || qty > 10000) {
        await conn.rollback();
        return fail("FIELD_ORDER_INVALID:Each quantity must be between 1 and 10,000.");
      }

      const [prows] = await conn.query(
        "SELECT id, owner_id, name, price, stock, status FROM products WHERE id = ? FOR UPDATE",
        [productId]
      );
      const product = prows[0];
      if (!product || product.status !== "live") {
        await conn.rollback();
        return fail("FIELD_ORDER_UNAVAILABLE:One of the products is no longer available for sale.");
      }
      if (Number(product.stock) < qty) {
        await conn.rollback();
        return fail(`FIELD_ORDER_STOCK:Only ${product.stock} unit(s) of "${product.name}" left in stock.`);
      }

      await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [qty, product.id]);

      const lineAmount = Math.round(Number(product.price) * qty * 100) / 100;
      const commission = Math.round(lineAmount * rate * 100) / 100;

      // unique order number with retry
      let orderId = null;
      let orderNo = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const ymd = new Date().toISOString().slice(2, 10).replace(/-/g, "");
        orderNo = `FLD-${ymd}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        orderId = crypto.randomUUID();
        try {
          await conn.query(
            `INSERT INTO orders
               (id, order_no, client_id, product_id, product_name, customer_name,
                customer_phone, city, state, channel, officer_name, officer_id,
                qty, unit_price, amount, commission_rate, commission_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'field', ?, ?, ?, ?, ?, ?, ?, 'processing')`,
            [
              orderId, orderNo, product.owner_id, product.id, product.name,
              String(p_customer_name).trim(),
              String(p_customer_phone || "").trim() || null,
              String(p_city).trim(),
              String(p_state || "").trim() || null,
              officer.name, p_officer_id,
              qty, product.price, lineAmount, rate, commission,
            ]
          );
          break;
        } catch (e) {
          if (e.code === "ER_DUP_ENTRY" && attempt < 2) continue;
          throw e;
        }
      }

      await conn.query(
        "INSERT INTO commissions (id, order_id, officer_id, rate, amount, status) VALUES (?, ?, ?, ?, ?, 'pending')",
        [crypto.randomUUID(), orderId, p_officer_id, rate, commission]
      );

      await conn.query(
        "INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, 'order', ?, ?, '/client/orders')",
        [
          crypto.randomUUID(),
          product.owner_id,
          `New field order ${orderNo}`,
          `${qty} x ${product.name} sold by ${officer.name}`,
        ]
      );

      total += lineAmount;
      totalComm += commission;
      outOrders.push({
        id: orderId,
        order_no: orderNo,
        product_name: product.name,
        qty,
        unit_price: Number(product.price),
        amount: lineAmount,
        commission,
      });
    }

    await syncWallet(p_officer_id, conn);
    await conn.commit();

    return ok({
      orders: outOrders,
      total_amount: Math.round(total * 100) / 100,
      commission_amount: Math.round(totalComm * 100) / 100,
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    return fail(err.message);
  } finally {
    conn.release();
  }
}

const RPCS = {
  user_names,
  admin_user_ids,
  chat_bump_thread,
  commission_summary_admin,
  orders_summary,
  officer_summary,
  officer_perf_daily,
  officer_perf_monthly,
  officer_leaderboard,
  admin_summary,
  admin_clients_overview,
  admin_officers_overview,
  admin_revenue_by_month,
  admin_region_stats,
  place_field_order,
};

async function rpc(name, args = {}) {
  const fn = RPCS[name];
  if (!fn) return { data: null, error: { message: `RPC ${name} not implemented` } };
  try {
    return await fn(args);
  } catch (err) {
    return { data: null, error: { message: err.message } };
  }
}

module.exports = { rpc };
