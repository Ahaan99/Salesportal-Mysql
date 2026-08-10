const { supabaseAdmin } = require("../config/supabase");
const { normalizePhone, PHONE_ERROR } = require("../utils/phone");

/**
 * SALES SUBMISSIONS — the FSO → Admin verification pipeline.
 *
 * Flow:
 *  1. FSO submits a completed sale  →  POST /api/field/sales
 *  2. Submission lands in 'pending' in sales_submissions
 *  3. Admin reviews                 →  GET  /api/admin/sales?status=pending
 *  4. Admin approves/rejects        →  PATCH /api/admin/sales/:id/review
 *  5. On APPROVE: order row + commission row created, officer notified
 *  6. On REJECT/HOLD: status updated, officer notified
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = ["pending", "approved", "rejected", "hold", "clarification"];
const PAYMENT_MODES = ["cash", "upi", "bank_transfer", "cheque", "other"];

const clamp = (n, min, max, fallback) => {
  const v = Number.parseInt(n, 10);
  if (Number.isNaN(v)) return fallback;
  return Math.min(Math.max(v, min), max);
};

const trimmed = (v, max) => String(v ?? "").trim().slice(0, max);


/* ========================= FIELD OFFICER SIDE ========================= */

/**
 * POST /api/field/sales
 * FSO submits a completed sale for admin verification.
 * Body: { product_id, customer_name, customer_company?, customer_phone?,
 *         city?, state?, qty, unit_price, invoice_ref?, payment_mode?,
 *         payment_ref?, remarks? }
 */
async function submitSale(req, res) {
  try {
    const body = req.body || {};
    const errors = {};

    // ---- product
    const productId = trimmed(body.product_id, 36);
    if (!UUID_RE.test(productId)) errors.product_id = "Select a valid product.";

    // ---- customer
    const customerName = trimmed(body.customer_name, 160);
    if (customerName.length < 1) errors.customer_name = "Customer name is required.";

    const customerCompany = trimmed(body.customer_company, 160) || null;

    const phone = normalizePhone(body.customer_phone);
    if (!phone.ok) errors.customer_phone = PHONE_ERROR;

    const city = trimmed(body.city, 100) || null;
    const state = trimmed(body.state, 100) || null;

    // ---- sale details
    const qty = Number.parseInt(body.qty, 10);
    if (!Number.isFinite(qty) || qty < 1) errors.qty = "Quantity must be at least 1.";

    const unitPrice = Number.parseFloat(body.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) errors.unit_price = "Enter a valid selling price.";

    const invoiceRef = trimmed(body.invoice_ref, 200) || null;
    const paymentMode = PAYMENT_MODES.includes(body.payment_mode) ? body.payment_mode : null;
    const paymentRef = trimmed(body.payment_ref, 200) || null;
    const remarks = trimmed(body.remarks, 1000) || null;

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({ error: "Please fix the highlighted fields.", fields: errors });
    }

    // Verify product exists and is live
    const { data: product, error: productErr } = await supabaseAdmin
      .from("products")
      .select("id, name, status")
      .eq("id", productId)
      .maybeSingle();

    if (productErr || !product) {
      return res.status(404).json({ error: "Product not found." });
    }
    if (product.status !== "live") {
      return res.status(422).json({
        error: "This product is not available for sale.",
        fields: { product_id: "Product must be live to submit a sale." },
      });
    }

    // Get officer display name for the submission snapshot
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", req.user.id)
      .maybeSingle();

    const officerName = profile?.full_name ?? req.user.email ?? "Unknown Officer";
    const totalAmount = Math.round(unitPrice * qty * 100) / 100;

    const { data: submission, error: insertErr } = await supabaseAdmin
      .from("sales_submissions")
      .insert({
        officer_id: req.user.id,
        officer_name: officerName,
        product_id: productId,
        product_name: product.name,
        customer_name: customerName,
        customer_company: customerCompany,
        customer_phone: phone.value,
        city,
        state,
        qty,
        unit_price: unitPrice,
        total_amount: totalAmount,
        invoice_ref: invoiceRef,
        payment_mode: paymentMode,
        payment_ref: paymentRef,
        remarks,
        status: "pending",
      })
      .select("id, status, created_at")
      .single();

    if (insertErr) {
      console.error("[sales:submit]", insertErr.message);
      return res.status(500).json({ error: "Could not submit your sale. Please try again." });
    }

    // Notify the officer (fire-and-forget — never block the response)
    supabaseAdmin.from("notifications").insert({
      user_id: req.user.id,
      type: "order",
      title: "Sale submitted for verification",
      message: `Your sale of ${product.name} (×${qty}) has been submitted for verification.`,
    }).then(() => {}).catch(() => {});

    return res.status(201).json({
      submission_id: submission.id,
      status: submission.status,
      message:
        "Sale submitted! The Recruweb team will review it and release your commission once verified.",
    });
  } catch (err) {
    console.error("[sales:submit]", err.message);
    return res.status(500).json({ error: "Could not submit your sale." });
  }
}

/**
 * GET /api/field/sales
 * Field officer views their own submissions.
 * Query: status?, page, page_size
 */
async function listMySales(req, res) {
  try {
    const page = clamp(req.query.page, 1, 100000, 1);
    const pageSize = clamp(req.query.page_size, 1, 50, 20);
    const from = (page - 1) * pageSize;

    let query = supabaseAdmin
      .from("sales_submissions")
      .select(
        "id, product_name, customer_name, customer_company, city, state, qty, unit_price, total_amount, status, admin_note, invoice_ref, payment_mode, created_at, reviewed_at",
        { count: "exact" }
      )
      .eq("officer_id", req.user.id)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    const statusParam = (req.query.status ?? "").toString().trim();
    if (VALID_STATUSES.includes(statusParam)) {
      query = query.eq("status", statusParam);
    }

    const { data, count, error } = await query;
    if (error) {
      console.error("[sales:listMySales]", error.message);
      return res.status(500).json({ error: "Could not load your sales." });
    }

    return res.json({
      submissions: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    console.error("[sales:listMySales]", err.message);
    return res.status(500).json({ error: "Could not load your sales." });
  }
}

/* ========================= ADMIN SIDE ========================= */

/**
 * GET /api/admin/sales
 * Admin lists submissions filtered by status.
 * Default: pending (oldest first for review fairness).
 * Query: status?, page, page_size
 */
async function listPendingSales(req, res) {
  try {
    const page = clamp(req.query.page, 1, 100000, 1);
    const pageSize = clamp(req.query.page_size, 1, 50, 20);
    const from = (page - 1) * pageSize;

    const statusParam = VALID_STATUSES.includes(req.query.status)
      ? req.query.status
      : "pending";
    const isPending = statusParam === "pending";

    const { data, count, error } = await supabaseAdmin
      .from("sales_submissions")
      .select(
        "id, officer_id, officer_name, product_id, product_name, " +
        "customer_name, customer_company, customer_phone, city, state, " +
        "qty, unit_price, total_amount, commission_rate, " +
        "invoice_ref, payment_mode, payment_ref, remarks, " +
        "status, admin_note, reviewed_at, created_at",
        { count: "exact" }
      )
      .eq("status", statusParam)
      // Oldest pending first (fairness); newest for closed statuses
      .order("created_at", { ascending: isPending })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[sales:listPending]", error.message);
      return res.status(500).json({ error: "Could not load sales submissions." });
    }

    return res.json({
      submissions: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
      status: statusParam,
    });
  } catch (err) {
    console.error("[sales:listPending]", err.message);
    return res.status(500).json({ error: "Could not load sales submissions." });
  }
}

/**
 * PATCH /api/admin/sales/:id/review
 * Admin approves, rejects, holds, or requests clarification on a submission.
 * Body: { action: 'approve'|'reject'|'hold'|'clarification', note?: string }
 *
 * On APPROVE only:
 *  - Creates a row in public.orders
 *  - Creates a row in public.commissions
 *  - Sets submission.order_id
 * Always:
 *  - Updates submission status + admin_note + reviewed fields
 *  - Sends an in-app notification to the officer
 */
async function reviewSale(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: "Invalid submission ID." });
    }

    const body = req.body || {};
    const validActions = ["approve", "reject", "hold", "clarification"];
    const action = validActions.includes(body.action) ? body.action : null;
    if (!action) {
      return res.status(422).json({
        error: "action must be one of: approve, reject, hold, clarification.",
      });
    }

    const note = trimmed(body.note, 1000) || null;

    // Fetch the submission
    const { data: sub, error: fetchErr } = await supabaseAdmin
      .from("sales_submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !sub) {
      return res.status(404).json({ error: "Submission not found." });
    }

    // Already finalised — prevent duplicate processing
    if (sub.status === "approved" || sub.status === "rejected") {
      return res.status(409).json({
        error: `This submission is already ${sub.status}.`,
      });
    }

    const newStatus =
      action === "approve" ? "approved" :
      action === "reject"  ? "rejected" :
      action === "hold"    ? "hold"      :
                             "clarification";

    let orderId = sub.order_id;

    // ---- APPROVE: create order + commission ----
    if (action === "approve") {
      const orderNo = `RW-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 5)
        .toUpperCase()}`;

      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .insert({
          order_no:      orderNo,
          client_id:     sub.officer_id,
          product_id:    sub.product_id,
          product_name:  sub.product_name,
          officer_name:  sub.officer_name,
          customer_name: sub.customer_name,
          city:          sub.city || "N/A",
          state:          sub.state,
          channel:        "field",
          status:         "processing",
          qty:            sub.qty,
          unit_price:     sub.unit_price,
          amount:         sub.total_amount,
          placed_at:      new Date().toISOString(),
        })
        .select("id")
        .single();

      if (orderErr) {
        console.error("[sales:review:order]", orderErr.message);
        return res.status(500).json({
          error: "Could not create order record. Please try again.",
        });
      }
      orderId = order.id;

      // Commission row (non-fatal if it fails — fixable manually)
      const commissionAmount =
        Math.round(sub.total_amount * Number(sub.commission_rate) * 100) / 100;

      supabaseAdmin
        .from("commissions")
        .insert({
          order_id:   orderId,
          officer_id: sub.officer_id,
          rate:       sub.commission_rate,
          amount:     commissionAmount,
          status:     "pending",
        })
        .then(({ error: e }) => {
          if (e) console.error("[sales:review:commission]", e.message);
        });
    }

    // ---- Update submission ----
    const { error: updateErr } = await supabaseAdmin
      .from("sales_submissions")
      .update({
        status:      newStatus,
        admin_note:  note,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        order_id:    orderId ?? null,
      })
      .eq("id", id);

    if (updateErr) {
      console.error("[sales:review:update]", updateErr.message);
      return res.status(500).json({ error: "Could not update submission status." });
    }

    // ---- Notify the officer (fire-and-forget) ----
    const commAmt = Math.round(sub.total_amount * Number(sub.commission_rate)).toLocaleString("en-IN");
    const notifTitle =
      action === "approve"       ? "✅ Sale approved — commission pending"   :
      action === "reject"        ? "❌ Sale submission rejected"              :
      action === "hold"          ? "⏸ Sale submission on hold"               :
                                   "ℹ️ Clarification needed on your sale";

    const notifBody =
      action === "approve"
        ? `${sub.product_name} ×${sub.qty} verified. ₹${commAmt} commission is now pending settlement.`
        : `${sub.product_name} ×${sub.qty} — ${note ?? "No additional details provided."}`;

    supabaseAdmin
      .from("notifications")
      .insert({
        user_id: sub.officer_id,
        type:    "commission",
        title:   notifTitle,
        message:    notifBody,
      })
      .then(() => {})
      .catch(() => {});

    return res.json({
      id,
      status:   newStatus,
      order_id: orderId ?? null,
      message:
        action === "approve"       ? "Submission approved. Order and commission created." :
        action === "reject"        ? "Submission rejected."                                :
        action === "hold"          ? "Submission placed on hold."                          :
                                     "Clarification request sent to officer.",
    });
  } catch (err) {
    console.error("[sales:review]", err.message);
    return res.status(500).json({ error: "Could not process your review." });
  }
}

/**
 * GET /api/admin/kpis
 * Live dashboard KPIs for the admin command center.
 */
async function getAdminKpis(req, res) {
  try {
    const [profilesRes, liveProductsRes, pendingVerifRes, commissionsRes] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("user_id", { count: "exact", head: true }),
        supabaseAdmin
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("status", "live"),
        supabaseAdmin
          .from("sales_submissions")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabaseAdmin
          .from("commissions")
          .select("amount, status")
          .limit(5000),
      ]);

    const commissions = commissionsRes.data ?? [];
    const totalCommission = commissions.reduce((s, r) => s + Number(r.amount), 0);
    const pendingCommission = commissions
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + Number(r.amount), 0);
    const settledCommission = commissions
      .filter((r) => r.status === "settled")
      .reduce((s, r) => s + Number(r.amount), 0);

    return res.json({
      totalOfficers:      profilesRes.count      ?? 0,
      liveProducts:       liveProductsRes.count  ?? 0,
      pendingVerifications: pendingVerifRes.count ?? 0,
      totalCommission,
      pendingCommission,
      settledCommission,
    });
  } catch (err) {
    console.error("[admin:kpis]", err.message);
    return res.status(500).json({ error: "Could not load KPIs." });
  }
}

module.exports = {
  submitSale,
  listMySales,
  listPendingSales,
  reviewSale,
  getAdminKpis,
};
