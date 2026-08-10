const { supabaseAdmin } = require("../config/supabase");

const REFUND_METHODS = ["original-payment", "wallet", "bank-transfer"];
const REFUND_STATUSES = ["pending", "processing", "completed", "failed"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Legal lifecycle transitions. Terminal states are immutable — money that
// has moved (completed) or definitively failed can never be "un-moved".
const VALID_TRANSITIONS = {
  pending: ["processing", "completed", "failed"],
  processing: ["completed", "failed"],
  completed: [],
  failed: [],
};

// Strict money coercion: "" / null / "12abc" / NaN / Infinity all fail.
const toMoney = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/**
 * POST /api/refunds  (admin only — enforced in routes)
 * Process a refund for an approved return.
 *
 * Guarantees:
 *  - amount is a real finite number bounded by the approved return amount
 *  - one active refund per return (double-refund protection): a new
 *    refund may only be created if no pending/processing/completed
 *    refund already exists for the return. Failed refunds may be retried.
 */
async function createRefund(req, res) {
  try {
    const body = req.body || {};
    const returnId = String(body.return_id ?? "").trim();
    const orderId = String(body.order_id ?? "").trim();
    const amount = toMoney(body.amount);
    const refundMethod = String(body.refund_method ?? "").trim();

    // --- Validation
    if (!UUID_RE.test(returnId) || !UUID_RE.test(orderId)) {
      return res.status(400).json({ error: "Invalid return or order id" });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Refund amount must be a positive number" });
    }
    if (!REFUND_METHODS.includes(refundMethod)) {
      return res.status(400).json({ error: "Invalid refund method" });
    }

    // --- Verify return exists, is approved, and matches the order
    const { data: returnRecord, error: returnErr } = await supabaseAdmin
      .from("returns")
      .select("id, order_id, client_id, refund_amount, status")
      .eq("id", returnId)
      .single();

    if (returnErr || !returnRecord) {
      return res.status(404).json({ error: "Return not found" });
    }

    if (returnRecord.order_id !== orderId) {
      return res.status(400).json({ error: "Order does not match this return" });
    }

    if (returnRecord.status !== "approved") {
      return res.status(409).json({ error: "Return must be approved to process refund" });
    }

    if (amount > toMoney(returnRecord.refund_amount)) {
      return res.status(400).json({
        error: `Refund cannot exceed return amount (${returnRecord.refund_amount})`,
      });
    }

    // --- Double-refund guard: only one non-failed refund per return
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("refunds")
      .select("id, status")
      .eq("return_id", returnId)
      .in("status", ["pending", "processing", "completed"])
      .limit(1);

    if (existErr) {
      console.error("[refunds:create] duplicate check:", existErr.message);
      return res.status(500).json({ error: "Could not process refund" });
    }
    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: `A ${existing[0].status} refund already exists for this return.`,
      });
    }

    // --- Create refund
    const { data: refund, error: refundErr } = await supabaseAdmin
      .from("refunds")
      .insert({
        return_id: returnId,
        order_id: orderId,
        client_id: returnRecord.client_id,
        amount,
        refund_method: refundMethod,
        status: "pending",
      })
      .select()
      .single();

    if (refundErr) {
      console.error("[refunds:create]", refundErr.message);
      return res.status(500).json({ error: "Could not process refund" });
    }

    return res.status(201).json(refund);
  } catch (err) {
    console.error("[refunds:create]", err.message);
    return res.status(500).json({ error: "Could not process refund" });
  }
}

/**
 * GET /api/refunds
 * List refunds for authenticated client
 * Query params: status, page, page_size
 */
async function listRefunds(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.page_size, 10) || 20));
    const from = (page - 1) * pageSize;

    let query = supabaseAdmin
      .from("refunds")
      .select(
        `id, return_id, order_id, amount, refund_method, status, failure_reason, processed_at, created_at, updated_at,
         returns(id, reason_code, return_qty),
         orders(order_no, product_name, customer_name, city, amount)`,
        { count: "exact" }
      )
      .eq("client_id", req.user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true }) // stable tiebreaker for pagination
      .range(from, from + pageSize - 1);

    // Filter by status if provided
    const status = (req.query.status ?? "").toString().trim();
    if (REFUND_STATUSES.includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      // Requesting a page beyond the last one is not an error to the user.
      if (error.code === "PGRST103") {
        return res.json({ refunds: [], total: count ?? 0, page, pageSize });
      }
      console.error("[refunds:list]", error.message);
      return res.status(500).json({ error: "Could not load refunds" });
    }

    return res.json({
      refunds: (data ?? []).map((r) => ({
        ...r,
        return: r.returns,
        order: r.orders,
      })),
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("[refunds:list]", err.message);
    return res.status(500).json({ error: "Could not load refunds" });
  }
}

/**
 * GET /api/refunds/:id
 * Get a specific refund
 */
async function getRefund(req, res) {
  try {
    const id = String(req.params.id ?? "");
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ error: "Refund not found" });
    }

    const { data, error } = await supabaseAdmin
      .from("refunds")
      .select(
        `id, return_id, order_id, amount, refund_method, status, failure_reason, processed_at, created_at, updated_at,
         returns(id, reason_code, return_qty, refund_amount),
         orders(order_no, product_name, customer_name, city, amount)`
      )
      .eq("id", id)
      .eq("client_id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Refund not found" });
    }

    return res.json({
      ...data,
      return: data.returns,
      order: data.orders,
    });
  } catch (err) {
    console.error("[refunds:get]", err.message);
    return res.status(500).json({ error: "Could not load refund" });
  }
}

/**
 * PATCH /api/refunds/:id/status  (admin only — enforced in routes)
 * Update refund status with a strict state machine:
 *   pending    -> processing | completed | failed
 *   processing -> completed | failed
 *   completed  -> (terminal)
 *   failed     -> (terminal)
 * The update itself is guarded with .eq("status", current) so two admins
 * racing on the same refund can never double-transition it.
 */
async function updateRefundStatus(req, res) {
  try {
    const id = String(req.params.id ?? "");
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ error: "Refund not found" });
    }

    const { status, failure_reason } = req.body || {};

    if (!status || !REFUND_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // --- Load current state to validate the transition
    const { data: current, error: getErr } = await supabaseAdmin
      .from("refunds")
      .select("id, status, return_id, order_id")
      .eq("id", id)
      .single();

    if (getErr || !current) {
      return res.status(404).json({ error: "Refund not found" });
    }

    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(status)) {
      return res.status(409).json({
        error: `Cannot change a ${current.status} refund to ${status}.`,
      });
    }

    const updateData = { status };

    // Track completion time
    if (status === "completed") {
      updateData.processed_at = new Date().toISOString();
    }

    // Track failure reason
    if (status === "failed") {
      const reason = typeof failure_reason === "string" ? failure_reason.trim() : "";
      if (!reason) {
        return res.status(400).json({ error: "Failure reason required for failed status" });
      }
      updateData.failure_reason = reason.slice(0, 1000);
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("refunds")
      .update(updateData)
      .eq("id", id)
      .eq("status", current.status) // atomic guard against concurrent updates
      .select()
      .maybeSingle();

    if (updateErr) {
      console.error("[refunds:updateStatus]", updateErr.message);
      return res.status(500).json({ error: "Could not update refund" });
    }
    if (!updated) {
      return res
        .status(409)
        .json({ error: "Refund state changed — refresh and try again." });
    }

    // --- Cascade: a completed refund finalizes the whole return lifecycle.
    // Without this, the return stays "approved"/"shipped" forever and never
    // shows up under the "completed" filter even though money moved.
    if (status === "completed") {
      const { error: retErr } = await supabaseAdmin
        .from("returns")
        .update({ status: "completed" })
        .eq("id", updated.return_id)
        .in("status", ["approved", "shipped"]); // never resurrect a rejected return

      if (retErr) {
        // The refund itself succeeded — log loudly but don't fail the request.
        console.error("[refunds:updateStatus] cascade return failed:", retErr.message);
      }

      const { error: ordErr } = await supabaseAdmin
        .from("orders")
        .update({ status: "returned" })
        .eq("id", updated.order_id)
        .eq("status", "delivered"); // only a delivered order can become returned

      if (ordErr) {
        console.error("[refunds:updateStatus] cascade order failed:", ordErr.message);
      }
    }

    return res.json(updated);
  } catch (err) {
    console.error("[refunds:updateStatus]", err.message);
    return res.status(500).json({ error: "Could not update refund" });
  }
}

module.exports = { createRefund, listRefunds, getRefund, updateRefundStatus };
