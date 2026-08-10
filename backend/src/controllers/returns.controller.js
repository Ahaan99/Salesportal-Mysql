const { supabaseAdmin } = require("../config/supabase");

const RETURN_STATUSES = ["pending", "approved", "rejected", "shipped", "completed"];
// Returns that still "hold" quantity against the order (not rejected).
const ACTIVE_RETURN_STATUSES = ["pending", "approved", "shipped", "completed"];
const REASON_CODES = ["defective", "not-as-described", "changed-mind", "damaged", "other"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTES = 1000;

// Strict numeric coercion: "" / null / "12abc" / NaN / Infinity all fail.
const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const toMoney = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/**
 * POST /api/returns
 * Create a new return request.
 *
 * Server-side guarantees (never trust the client):
 *  - the order exists, belongs to the caller, and has been DELIVERED
 *  - quantities/amounts are real finite numbers (NaN can't sneak past)
 *  - cumulative returned qty across all active returns never exceeds
 *    the order qty (no over-returning via repeated requests)
 *  - the refund never exceeds the proportional value of the returned items
 */
async function createReturn(req, res) {
  try {
    const body = req.body || {};
    const orderId = String(body.order_id ?? "").trim();
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const reasonCode = String(body.reason_code ?? "").trim();
    const returnQty = toInt(body.return_qty);
    const refundAmount = toMoney(body.refund_amount);

    // --- Validation (strict types — NaN fails every branch below)
    if (!UUID_RE.test(orderId)) {
      return res.status(400).json({ error: "Invalid order id" });
    }
    if (reason.length < 5 || reason.length > 500) {
      return res.status(400).json({ error: "Reason must be 5-500 characters" });
    }
    if (!REASON_CODES.includes(reasonCode)) {
      return res.status(400).json({ error: "Invalid reason code" });
    }
    if (!Number.isInteger(returnQty) || returnQty <= 0 || returnQty > 10000) {
      return res.status(400).json({ error: "Return quantity must be a whole number between 1 and 10000" });
    }
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return res.status(400).json({ error: "Refund amount must be a positive number" });
    }

    // --- Verify order exists and belongs to this client
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, qty, amount, status")
      .eq("id", orderId)
      .eq("client_id", req.user.id)
      .single();

    if (orderErr || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // --- Only delivered orders can be returned
    if (!["delivered", "returned"].includes(order.status)) {
      return res.status(409).json({
        error: `Only delivered orders can be returned (this order is ${order.status}).`,
      });
    }

    // --- Cumulative guard: qty already claimed by active returns
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("returns")
      .select("return_qty, status")
      .eq("order_id", orderId)
      .eq("client_id", req.user.id)
      .in("status", ACTIVE_RETURN_STATUSES);

    if (existErr) {
      console.error("[returns:create] existing lookup:", existErr.message);
      return res.status(500).json({ error: "Could not create return request" });
    }

    const alreadyReturning = (existing ?? []).reduce(
      (sum, r) => sum + (Number(r.return_qty) || 0),
      0
    );
    const remainingQty = order.qty - alreadyReturning;
    if (remainingQty <= 0) {
      return res.status(409).json({
        error: "A return has already been requested for all items in this order.",
      });
    }
    if (returnQty > remainingQty) {
      return res.status(400).json({
        error: `Only ${remainingQty} item(s) remain returnable for this order.`,
      });
    }

    // --- Refund can never exceed the proportional value of returned items
    // (unit price derived server-side from the order — never from the client).
    const unitPrice = order.qty > 0 ? order.amount / order.qty : 0;
    const maxRefund = Math.round(unitPrice * returnQty * 100) / 100;
    if (refundAmount > maxRefund + 0.01) {
      return res.status(400).json({
        error: `Refund cannot exceed the value of the returned items (${maxRefund.toFixed(2)})`,
      });
    }

    // --- Create return
    const { data: returnRecord, error: returnErr } = await supabaseAdmin
      .from("returns")
      .insert({
        order_id: orderId,
        client_id: req.user.id,
        reason,
        reason_code: reasonCode,
        return_qty: returnQty,
        refund_amount: refundAmount,
        status: "pending",
      })
      .select()
      .single();

    if (returnErr) {
      console.error("[returns:create]", returnErr.message);
      return res.status(500).json({ error: "Could not create return request" });
    }

    return res.status(201).json(returnRecord);
  } catch (err) {
    console.error("[returns:create]", err.message);
    return res.status(500).json({ error: "Could not create return request" });
  }
}

/**
 * GET /api/returns
 * List returns for authenticated client
 * Query params: status, page, page_size
 */
async function listReturns(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.page_size, 10) || 20));
    const from = (page - 1) * pageSize;

    let query = supabaseAdmin
      .from("returns")
      .select(
        `id, order_id, reason, reason_code, return_qty, refund_amount, status, created_at, updated_at,
         orders(order_no, product_name, customer_name, city, amount),
         refunds(id, amount, status)`,
        { count: "exact" }
      )
      .eq("client_id", req.user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true }) // stable tiebreaker for pagination
      .range(from, from + pageSize - 1);

    // Filter by status if provided
    const status = (req.query.status ?? "").toString().trim();
    if (RETURN_STATUSES.includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      // Requesting a page beyond the last one is not an error to the user.
      if (error.code === "PGRST103") {
        return res.json({ returns: [], total: count ?? 0, page, pageSize });
      }
      console.error("[returns:list]", error.message);
      return res.status(500).json({ error: "Could not load returns" });
    }

    return res.json({
      returns: (data ?? []).map((r) => ({
        ...r,
        order: r.orders,
        refund: r.refunds?.[0] ?? null,
      })),
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("[returns:list]", err.message);
    return res.status(500).json({ error: "Could not load returns" });
  }
}

/**
 * GET /api/returns/:id
 * Get a specific return
 */
async function getReturn(req, res) {
  try {
    const id = String(req.params.id ?? "");
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ error: "Return not found" });
    }

    const { data, error } = await supabaseAdmin
      .from("returns")
      .select(
        `id, order_id, reason, reason_code, return_qty, refund_amount, status, notes, created_at, updated_at,
         orders(order_no, product_name, customer_name, city, amount),
         refunds(id, amount, status, failure_reason, processed_at)`
      )
      .eq("id", id)
      .eq("client_id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Return not found" });
    }

    return res.json({
      ...data,
      order: data.orders,
      refund: data.refunds?.[0] ?? null,
    });
  } catch (err) {
    console.error("[returns:get]", err.message);
    return res.status(500).json({ error: "Could not load return" });
  }
}

/**
 * PATCH /api/returns/:id
 * Client: update the notes on their OWN return.
 *
 * SECURITY: clients must never be able to change a return's status —
 * the previous implementation allowed a client to move their own pending
 * return to "approved"/"completed", i.e. self-approve their refund.
 * Status transitions (approve / reject / ship / complete) are admin
 * operations and belong behind requireRole("admin") routes.
 */
async function updateReturn(req, res) {
  try {
    const id = String(req.params.id ?? "");
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ error: "Return not found" });
    }

    const { status, notes } = req.body || {};

    // Explicitly reject status changes from clients instead of silently
    // ignoring them — the caller should know the request is not allowed.
    if (status !== undefined) {
      return res
        .status(403)
        .json({ error: "Return status can only be changed by an administrator." });
    }

    if (notes !== undefined && typeof notes !== "string") {
      return res.status(400).json({ error: "Notes must be text" });
    }
    const cleanNotes = notes === undefined ? undefined : notes.trim().slice(0, MAX_NOTES);
    if (cleanNotes === undefined) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    // --- Verify return exists and belongs to this client
    const { data: returnRecord, error: getErr } = await supabaseAdmin
      .from("returns")
      .select("id, status")
      .eq("id", id)
      .eq("client_id", req.user.id)
      .single();

    if (getErr || !returnRecord) {
      return res.status(404).json({ error: "Return not found" });
    }

    // Notes are only editable while the request is still open.
    if (!["pending", "approved"].includes(returnRecord.status)) {
      return res
        .status(409)
        .json({ error: `This return is ${returnRecord.status} and can no longer be edited.` });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("returns")
      .update({ notes: cleanNotes })
      .eq("id", id)
      .eq("client_id", req.user.id) // ownership enforced on the write too
      .select()
      .single();

    if (updateErr) {
      console.error("[returns:update]", updateErr.message);
      return res.status(500).json({ error: "Could not update return" });
    }

    return res.json(updated);
  } catch (err) {
    console.error("[returns:update]", err.message);
    return res.status(500).json({ error: "Could not update return" });
  }
}

/**
 * DELETE /api/returns/:id
 * Client: cancel (delete) their OWN return while it is still pending.
 *
 * SECURITY:
 *  - ownership enforced on both the read and the delete
 *  - only "pending" returns can be cancelled; once an admin has acted
 *    (approved / rejected / shipped / completed) the record is immutable
 *    to the client, and any linked refund stays intact.
 */
async function cancelReturn(req, res) {
  try {
    const id = String(req.params.id ?? "");
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ error: "Return not found" });
    }

    // --- Verify return exists, belongs to this client, and is still pending
    const { data: returnRecord, error: getErr } = await supabaseAdmin
      .from("returns")
      .select("id, status")
      .eq("id", id)
      .eq("client_id", req.user.id)
      .single();

    if (getErr || !returnRecord) {
      return res.status(404).json({ error: "Return not found" });
    }

    if (returnRecord.status !== "pending") {
      return res.status(409).json({
        error: `Only pending returns can be cancelled (this return is ${returnRecord.status}).`,
      });
    }

    const { error: delErr } = await supabaseAdmin
      .from("returns")
      .delete()
      .eq("id", id)
      .eq("client_id", req.user.id) // ownership enforced on the write too
      .eq("status", "pending"); // guard against a race with an admin approval

    if (delErr) {
      console.error("[returns:cancel]", delErr.message);
      return res.status(500).json({ error: "Could not cancel return" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[returns:cancel]", err.message);
    return res.status(500).json({ error: "Could not cancel return" });
  }
}

module.exports = { createReturn, listReturns, getReturn, updateReturn, cancelReturn };
