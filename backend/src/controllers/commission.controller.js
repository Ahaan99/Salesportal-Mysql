const { supabaseAdmin } = require("../config/supabase");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const trimmed = (v, max) => String(v ?? "").trim().slice(0, max);

const clamp = (n, min, max, fallback) => {
  const v = Number.parseInt(n, 10);
  return Number.isNaN(v) ? fallback : Math.min(Math.max(v, min), max);
};

/**
 * commissions.officer_id / payout_requests.officer_id reference auth.users,
 * not profiles, so PostgREST can't embed profiles directly. Fetch the
 * profiles in one batched query and attach them under the same `profiles`
 * key the frontend already expects.
 */
async function attachOfficerProfiles(rows, columns) {
  const ids = [...new Set((rows ?? []).map((r) => r.officer_id).filter(Boolean))];
  if (ids.length === 0) return rows ?? [];

  const { data: profs, error } = await supabaseAdmin
    .from("profiles")
    .select(`user_id, ${columns}`)
    .in("user_id", ids);

  if (error) {
    console.error("[commissions:profiles]", error.message);
    return (rows ?? []).map((r) => ({ ...r, profiles: null }));
  }

  const byId = new Map((profs ?? []).map((p) => [p.user_id, p]));
  return (rows ?? []).map((r) => ({ ...r, profiles: byId.get(r.officer_id) ?? null }));
}

/* =====================================================================
   COMMISSION MANAGEMENT — Admin side
   ===================================================================== */

/**
 * GET /api/admin/commissions
 * List all commissions with officer + order info, filterable by status.
 * ?status=pending|available|settled  ?page=1  ?page_size=20
 */
async function listAllCommissions(req, res) {
  try {
    const validStatuses = ["pending", "available", "settled"];
    const status = validStatuses.includes(req.query.status) ? req.query.status : null;
    const page     = clamp(req.query.page, 1, 1000, 1);
    const pageSize = clamp(req.query.page_size, 1, 100, 20);
    const offset   = (page - 1) * pageSize;

    let q = supabaseAdmin
      .from("commissions")
      .select(`
        id, officer_id, rate, amount, status, settled_at, created_at,
        orders ( order_no, product_name, qty, amount, placed_at, customer_name )
      `, { count: "exact" });

    if (status) q = q.eq("status", status);

    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[commissions:list]", error.message);
      return res.status(500).json({ error: "Could not fetch commissions." });
    }

    const commissions = await attachOfficerProfiles(
      data,
      "full_name, phone, bank_name, bank_account, bank_ifsc"
    );

    return res.json({ commissions, total: count ?? 0, page, page_size: pageSize });
  } catch (err) {
    console.error("[commissions:list]", err.message);
    return res.status(500).json({ error: "Could not fetch commissions." });
  }
}

/**
 * GET /api/admin/commissions/summary
 * Aggregate totals: total earned, pending, available, settled.
 */
async function getCommissionSummary(req, res) {
  try {
    const { data, error } = await supabaseAdmin.rpc("commission_summary_admin");

    if (error) {
      // Fallback: manual aggregation if RPC doesn't exist yet
      const { data: rows, error: e2 } = await supabaseAdmin
        .from("commissions")
        .select("amount, status");

      if (e2) return res.status(500).json({ error: "Could not fetch summary." });

      const totals = { pending: 0, available: 0, settled: 0, total: 0 };
      for (const r of rows ?? []) {
        totals.total += Number(r.amount);
        if (r.status === "pending")   totals.pending   += Number(r.amount);
        if (r.status === "available") totals.available += Number(r.amount);
        if (r.status === "settled")   totals.settled   += Number(r.amount);
      }

      return res.json(totals);
    }

    return res.json(data?.[0] ?? { pending: 0, available: 0, settled: 0, total: 0 });
  } catch (err) {
    console.error("[commissions:summary]", err.message);
    return res.status(500).json({ error: "Could not fetch summary." });
  }
}

/**
 * PATCH /api/admin/commissions/:id/status
 * Move a commission: pending → available, available → settled.
 * Body: { action: "release" | "settle", note? }
 */
async function updateCommissionStatus(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid commission ID." });

    const validActions = ["release", "settle"];
    const action = validActions.includes(req.body?.action) ? req.body.action : null;
    if (!action) {
      return res.status(422).json({ error: "action must be 'release' or 'settle'." });
    }

    const { data: comm, error: fetchErr } = await supabaseAdmin
      .from("commissions")
      .select("id, status, officer_id, amount")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !comm) return res.status(404).json({ error: "Commission not found." });

    const transitions = { pending: "release", available: "settle" };
    if (transitions[comm.status] !== action) {
      return res.status(409).json({
        error: `Cannot ${action} a commission that is ${comm.status}.`,
      });
    }

    const newStatus    = action === "release" ? "available" : "settled";
    const settledAt    = action === "settle" ? new Date().toISOString() : null;

    const { error: updateErr } = await supabaseAdmin
      .from("commissions")
      .update({ status: newStatus, ...(settledAt ? { settled_at: settledAt } : {}) })
      .eq("id", id);

    if (updateErr) {
      console.error("[commissions:update]", updateErr.message);
      return res.status(500).json({ error: "Could not update commission." });
    }

    // Notify the officer (fire-and-forget)
    const title =
      action === "release"
        ? "💰 Commission released — available for payout"
        : "✅ Commission settled — payout processed";
    const body =
      action === "release"
        ? `₹${Number(comm.amount).toLocaleString("en-IN")} is now available. Request a payout from your earnings page.`
        : `₹${Number(comm.amount).toLocaleString("en-IN")} has been paid out.`;

    supabaseAdmin
      .from("notifications")
      .insert({ user_id: comm.officer_id, type: "commission", title, message: body })
      .then(() => {}).catch(() => {});

    return res.json({ id, status: newStatus, message: `Commission ${newStatus}.` });
  } catch (err) {
    console.error("[commissions:update]", err.message);
    return res.status(500).json({ error: "Could not update commission." });
  }
}

/**
 * GET /api/admin/commissions/payouts
 * List payout requests; filterable by status.
 * ?status=pending|processing|paid|rejected  ?page=1
 */
async function listPayoutRequests(req, res) {
  try {
    const validStatuses = ["pending", "processing", "paid", "rejected"];
    const status   = validStatuses.includes(req.query.status) ? req.query.status : null;
    const page     = clamp(req.query.page, 1, 1000, 1);
    const pageSize = clamp(req.query.page_size, 1, 100, 20);
    const offset   = (page - 1) * pageSize;

    let q = supabaseAdmin
      .from("payout_requests")
      .select(`
        id, officer_id, amount, bank_name, bank_account, bank_ifsc, upi_id,
        remarks, status, admin_note, reviewed_at, paid_at, transaction_ref, created_at
      `, { count: "exact" });

    if (status) q = q.eq("status", status);

    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[payouts:list]", error.message);
      return res.status(500).json({ error: "Could not fetch payout requests." });
    }

    const payouts = await attachOfficerProfiles(data, "full_name, phone");

    return res.json({ payouts, total: count ?? 0, page, page_size: pageSize });
  } catch (err) {
    console.error("[payouts:list]", err.message);
    return res.status(500).json({ error: "Could not fetch payout requests." });
  }
}

/**
 * PATCH /api/admin/commissions/payouts/:id/review
 * Process a payout: approve (processing → paid) or reject.
 * Body: { action: "approve" | "reject", transaction_ref?, note? }
 */
async function reviewPayoutRequest(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid payout ID." });

    const validActions = ["approve", "reject"];
    const action = validActions.includes(req.body?.action) ? req.body.action : null;
    if (!action) {
      return res.status(422).json({ error: "action must be 'approve' or 'reject'." });
    }

    const { data: payout, error: fetchErr } = await supabaseAdmin
      .from("payout_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !payout) return res.status(404).json({ error: "Payout request not found." });
    if (payout.status === "paid" || payout.status === "rejected") {
      return res.status(409).json({ error: `This payout is already ${payout.status}.` });
    }

    const now        = new Date().toISOString();
    const newStatus  = action === "approve" ? "paid" : "rejected";
    const txRef      = trimmed(req.body?.transaction_ref ?? "", 200) || null;
    const note       = trimmed(req.body?.note ?? "", 500) || null;

    const { error: updateErr } = await supabaseAdmin
      .from("payout_requests")
      .update({
        status:          newStatus,
        admin_note:      note,
        reviewed_by:     req.user.id,
        reviewed_at:     now,
        transaction_ref: txRef,
        paid_at:         action === "approve" ? now : null,
      })
      .eq("id", id);

    if (updateErr) {
      console.error("[payouts:review]", updateErr.message);
      return res.status(500).json({ error: "Could not process payout request." });
    }

    // On approval: mark the officer's available commissions as settled
    // (up to the payout amount) so wallet totals stay consistent.
    if (action === "approve") {
      // Get pending available commissions for this officer, oldest first
      const { data: availComms } = await supabaseAdmin
        .from("commissions")
        .select("id, amount")
        .eq("officer_id", payout.officer_id)
        .eq("status", "available")
        .order("created_at", { ascending: true });

      let remaining = Number(payout.amount);
      const toSettle = [];
      for (const c of availComms ?? []) {
        if (remaining <= 0) break;
        toSettle.push(c.id);
        remaining -= Number(c.amount);
      }

      if (toSettle.length > 0) {
        await supabaseAdmin
          .from("commissions")
          .update({ status: "settled", settled_at: now })
          .in("id", toSettle);
      }
    }

    // Notify officer
    const title = action === "approve" ? "🏦 Payout processed!" : "❌ Payout request rejected";
    const body  = action === "approve"
      ? `₹${Number(payout.amount).toLocaleString("en-IN")} has been transferred.${txRef ? ` Ref: ${txRef}` : ""}`
      : `Your payout of ₹${Number(payout.amount).toLocaleString("en-IN")} was rejected.${note ? ` Reason: ${note}` : ""}`;

    supabaseAdmin
      .from("notifications")
      .insert({ user_id: payout.officer_id, type: "commission", title, message: body })
      .then(() => {}).catch(() => {});

    return res.json({ id, status: newStatus, message: `Payout ${newStatus}.` });
  } catch (err) {
    console.error("[payouts:review]", err.message);
    return res.status(500).json({ error: "Could not process payout review." });
  }
}

/* =====================================================================
   COMMISSION / WALLET — Field Officer side
   ===================================================================== */

/**
 * GET /api/field/wallet
 * Returns the officer's wallet summary + recent commissions.
 */
async function getMyWallet(req, res) {
  try {
    const officerId = req.user.id;

    // Wallet totals
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from("officer_wallets")
      .select("pending_amount, available_amount, withdrawn_amount, total_earned, updated_at")
      .eq("officer_id", officerId)
      .maybeSingle();

    // If no wallet row yet (no commissions), return zeroed-out wallet
    const walletData = wallet ?? {
      pending_amount: 0,
      available_amount: 0,
      withdrawn_amount: 0,
      total_earned: 0,
      updated_at: null,
    };

    // Recent commissions (last 10)
    const { data: commissions } = await supabaseAdmin
      .from("commissions")
      .select("id, rate, amount, status, settled_at, created_at, orders(order_no, product_name, qty)")
      .eq("officer_id", officerId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Pending payout requests
    const { data: payouts } = await supabaseAdmin
      .from("payout_requests")
      .select("id, amount, status, created_at, paid_at, transaction_ref")
      .eq("officer_id", officerId)
      .order("created_at", { ascending: false })
      .limit(5);

    return res.json({
      wallet: walletData,
      recent_commissions: commissions ?? [],
      recent_payouts: payouts ?? [],
    });
  } catch (err) {
    console.error("[wallet:get]", err.message);
    return res.status(500).json({ error: "Could not load wallet." });
  }
}

/**
 * POST /api/field/wallet/payout
 * FSO requests a payout of their available balance.
 * Body: { amount, bank_name?, bank_account?, bank_ifsc?, upi_id?, remarks? }
 */
async function requestPayout(req, res) {
  try {
    const officerId = req.user.id;
    const body = req.body || {};

    const amount = Number.parseFloat(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(422).json({ error: "Enter a valid payout amount." });
    }

    // Verify sufficient available balance
    const { data: wallet } = await supabaseAdmin
      .from("officer_wallets")
      .select("available_amount")
      .eq("officer_id", officerId)
      .maybeSingle();

    const available = Number(wallet?.available_amount ?? 0);
    if (amount > available) {
      return res.status(422).json({
        error: `Insufficient available balance. Available: ₹${available.toLocaleString("en-IN")}.`,
      });
    }

    // Check for an already-pending payout to prevent duplicate requests
    const { data: existing } = await supabaseAdmin
      .from("payout_requests")
      .select("id")
      .eq("officer_id", officerId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: "You already have a pending payout request. Wait for it to be processed before submitting another.",
      });
    }

    // Fetch bank details from profile if not provided
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("bank_name, bank_account, bank_ifsc")
      .eq("user_id", officerId)
      .maybeSingle();

    const bankName    = trimmed(body.bank_name    ?? profile?.bank_name    ?? "", 200) || null;
    const bankAccount = trimmed(body.bank_account ?? profile?.bank_account ?? "", 200) || null;
    const bankIfsc    = trimmed(body.bank_ifsc    ?? profile?.bank_ifsc    ?? "", 20)  || null;
    const upiId       = trimmed(body.upi_id ?? "", 200) || null;
    const remarks     = trimmed(body.remarks ?? "", 500) || null;

    if (!upiId && !bankAccount) {
      return res.status(422).json({
        error: "Please provide a UPI ID or bank account details in your profile or this request.",
      });
    }

    const { data: newPayout, error: insertErr } = await supabaseAdmin
      .from("payout_requests")
      .insert({
        officer_id:   officerId,
        amount,
        bank_name:    bankName,
        bank_account: bankAccount,
        bank_ifsc:    bankIfsc,
        upi_id:       upiId,
        remarks,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[wallet:payout:insert]", insertErr.message);
      return res.status(500).json({ error: "Could not submit payout request." });
    }

    return res.status(201).json({
      payout_id: newPayout.id,
      amount,
      message: "Payout request submitted. The admin team will process it within 2–3 business days.",
    });
  } catch (err) {
    console.error("[wallet:payout]", err.message);
    return res.status(500).json({ error: "Could not submit payout request." });
  }
}

module.exports = {
  // Admin
  listAllCommissions,
  getCommissionSummary,
  updateCommissionStatus,
  listPayoutRequests,
  reviewPayoutRequest,
  // Field
  getMyWallet,
  requestPayout,
};
