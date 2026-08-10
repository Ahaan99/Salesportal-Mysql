const { supabaseAdmin } = require("../config/supabase");

/**
 * REPORTS & ANALYTICS
 *
 * Column-name contract (verified against db/*.sql):
 *   sales_submissions -> total_amount, created_at   (NOT sale_amount / submitted_at)
 *   kyc_submissions   -> status, user_role, submitted_at
 *   commissions       -> amount, status ('pending' | 'settled')
 *   orders            -> amount, status
 *
 * Error policy: the query that backs the page's core answer fails the
 * request loudly (500 + generic message); enrichment queries degrade
 * gracefully and are logged server-side. No Supabase internals ever
 * leak into a response.
 */

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v) => Math.round(v * 100) / 100;

/** GET /api/admin/reports/summary — platform KPIs. */
async function adminSummary(_req, res) {
  try {
    const [ordersRes, kycRes, salesRes] = await Promise.all([
      supabaseAdmin.from("orders").select("amount, status", { count: "exact" }),
      supabaseAdmin.from("kyc_submissions").select("status", { count: "exact" }),
      supabaseAdmin
        .from("sales_submissions")
        .select("total_amount, status", { count: "exact" }),
    ]);

    // GMV is the core answer — fail loudly if orders can't load.
    if (ordersRes.error) throw ordersRes.error;
    // KYC / field-sales degrade to zeros but are logged, never hidden.
    if (kycRes.error) console.error("[reports:adminSummary:kyc]", kycRes.error.message);
    if (salesRes.error) console.error("[reports:adminSummary:sales]", salesRes.error.message);

    const orders = ordersRes.data ?? [];
    const kyc = kycRes.data ?? [];
    const sales = salesRes.data ?? [];

    const gmv = orders
      .filter((o) => !["returned", "cancelled"].includes(o.status))
      .reduce((s, o) => s + num(o.amount), 0);

    const salesGmv = sales
      .filter((s) => s.status === "approved")
      .reduce((s, o) => s + num(o.total_amount), 0);

    const kycCounts = kyc.reduce((acc, k) => {
      acc[k.status] = (acc[k.status] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      gmv: round2(gmv),
      salesGmv: round2(salesGmv),
      totalOrders: ordersRes.count ?? orders.length,
      kycCounts: {
        draft: kycCounts.draft ?? 0,
        pending: kycCounts.pending ?? 0,
        approved: kycCounts.approved ?? 0,
        rejected: kycCounts.rejected ?? 0,
      },
    });
  } catch (err) {
    console.error("[reports:adminSummary]", err.message);
    return res.status(500).json({ error: "Could not load summary." });
  }
}

/** GET /api/admin/reports/sales-trend?days=30 — daily approved-sales GMV. */
async function adminSalesTrend(req, res) {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("sales_submissions")
      .select("total_amount, created_at, status")
      .eq("status", "approved")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Bucket by date
    const map = {};
    for (const row of data ?? []) {
      if (!row.created_at) continue;
      const date = row.created_at.slice(0, 10);
      map[date] = (map[date] || 0) + num(row.total_amount);
    }

    // Fill all dates in range so the chart never has gaps.
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const label = d.toISOString().slice(0, 10);
      trend.push({ date: label, value: round2(map[label] || 0) });
    }

    return res.json({ trend });
  } catch (err) {
    console.error("[reports:adminSalesTrend]", err.message);
    return res.status(500).json({ error: "Could not load sales trend." });
  }
}

/** GET /api/admin/reports/top-officers?limit=10 — top FSOs by approved GMV. */
async function adminTopOfficers(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const { data, error } = await supabaseAdmin
      .from("sales_submissions")
      .select("officer_id, officer_name, total_amount, status")
      .eq("status", "approved");

    if (error) throw error;

    const byOfficer = {};
    for (const row of data ?? []) {
      if (!row.officer_id) continue;
      if (!byOfficer[row.officer_id]) {
        byOfficer[row.officer_id] = { sales: 0, count: 0, name: row.officer_name };
      }
      byOfficer[row.officer_id].sales += num(row.total_amount);
      byOfficer[row.officer_id].count += 1;
    }

    // Enrich with profile name/city; snapshot officer_name is the fallback,
    // so a missing profile row can never produce "Unknown".
    const officerIds = Object.keys(byOfficer);
    let profileMap = {};
    if (officerIds.length > 0) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, city")
        .in("user_id", officerIds);
      if (pErr) console.error("[reports:adminTopOfficers:profiles]", pErr.message);
      profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p]));
    }

    const officers = officerIds
      .map((id) => ({
        id,
        name: profileMap[id]?.full_name ?? byOfficer[id].name ?? "Officer",
        city: profileMap[id]?.city ?? "—",
        sales: round2(byOfficer[id].sales),
        orders: byOfficer[id].count,
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, limit);

    return res.json({ officers });
  } catch (err) {
    console.error("[reports:adminTopOfficers]", err.message);
    return res.status(500).json({ error: "Could not load officer rankings." });
  }
}

/** GET /api/admin/reports/kyc-stats — KYC breakdown by status and role. */
async function adminKycStats(_req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from("kyc_submissions")
      .select("status, user_role, submitted_at");

    if (error) throw error;

    const rows = data ?? [];
    const byStatus = { draft: 0, pending: 0, approved: 0, rejected: 0 };
    const byRole = { field: 0, client: 0 };

    for (const r of rows) {
      if (r.status in byStatus) byStatus[r.status] += 1;
      if (r.user_role in byRole) byRole[r.user_role] += 1;
    }

    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const recentPending = rows.filter(
      (r) => r.status === "pending" && r.submitted_at && r.submitted_at >= since
    );

    return res.json({
      byStatus,
      byRole,
      total: rows.length,
      recentPending: recentPending.length,
    });
  } catch (err) {
    console.error("[reports:adminKycStats]", err.message);
    return res.status(500).json({ error: "Could not load KYC stats." });
  }
}

/** GET /api/admin/reports/commission-summary — payouts by status. */
async function adminCommissionSummary(_req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from("commissions")
      .select("amount, status");

    if (error) throw error;

    const summary = (data ?? []).reduce((acc, c) => {
      const key = c.status ?? "unknown";
      acc[key] = round2((acc[key] || 0) + num(c.amount));
      return acc;
    }, {});

    return res.json({ summary });
  } catch (err) {
    console.error("[reports:adminCommissionSummary]", err.message);
    return res.status(500).json({ error: "Could not load commission summary." });
  }
}

/* ═══════════════════════════════════════════════════════════════
   FIELD-OFFICER PERSONAL REPORTS
   ═══════════════════════════════════════════════════════════════ */

/** GET /api/field/reports?days=30 — personal analytics for the FSO. */
async function fieldMyReports(req, res) {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const uid = req.user.id; // from the verified JWT only

    const [salesRes, commissionRes, rankRes] = await Promise.all([
      supabaseAdmin
        .from("sales_submissions")
        .select("total_amount, status, created_at")
        .eq("officer_id", uid)
        .gte("created_at", since)
        .order("created_at", { ascending: true }),

      supabaseAdmin
        .from("commissions")
        .select("amount, status")
        .eq("officer_id", uid),

      supabaseAdmin
        .from("sales_submissions")
        .select("officer_id, total_amount")
        .eq("status", "approved"),
    ]);

    // Personal sales are the core answer — fail loudly.
    if (salesRes.error) throw salesRes.error;
    // Earnings and rank degrade gracefully.
    if (commissionRes.error)
      console.error("[reports:fieldMyReports:commissions]", commissionRes.error.message);
    if (rankRes.error)
      console.error("[reports:fieldMyReports:rank]", rankRes.error.message);

    const sales = salesRes.data ?? [];
    const commissions = commissionRes.data ?? [];
    const allApproved = rankRes.data ?? [];

    // Sales trend (approved only), zero-filled for every day in range.
    const trendMap = {};
    for (const s of sales.filter((s) => s.status === "approved")) {
      if (!s.created_at) continue;
      const date = s.created_at.slice(0, 10);
      trendMap[date] = (trendMap[date] || 0) + num(s.total_amount);
    }
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const label = d.toISOString().slice(0, 10);
      trend.push({ date: label, value: round2(trendMap[label] || 0) });
    }

    const totalSales = sales
      .filter((s) => s.status === "approved")
      .reduce((s, r) => s + num(r.total_amount), 0);
    const pendingSales = sales.filter((s) => s.status === "pending").length;
    const totalEarnings = commissions.reduce((s, c) => s + num(c.amount), 0);
    const pendingEarnings = commissions
      .filter((c) => c.status === "pending")
      .reduce((s, c) => s + num(c.amount), 0);

    // Rank among all officers by all-time approved GMV.
    const byOfficer = {};
    for (const row of allApproved) {
      if (!row.officer_id) continue;
      byOfficer[row.officer_id] = (byOfficer[row.officer_id] || 0) + num(row.total_amount);
    }
    const sorted = Object.entries(byOfficer).sort((a, b) => b[1] - a[1]);
    const myRank = sorted.findIndex(([id]) => id === uid) + 1;

    return res.json({
      trend,
      totalSales: round2(totalSales),
      pendingSales,
      totalEarnings: round2(totalEarnings),
      pendingEarnings: round2(pendingEarnings),
      rank: myRank || null,
      totalOfficers: sorted.length,
      salesCount: sales.length,
    });
  } catch (err) {
    console.error("[reports:fieldMyReports]", err.message);
    return res.status(500).json({ error: "Could not load your reports." });
  }
}

module.exports = {
  adminSummary,
  adminSalesTrend,
  adminTopOfficers,
  adminKycStats,
  adminCommissionSummary,
  fieldMyReports,
};
