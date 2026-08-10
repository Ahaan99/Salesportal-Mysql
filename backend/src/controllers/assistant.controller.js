/**
 * AI Assistant — Google Gemini-powered chatbot for the sales portal.
 *
 * POST /api/assistant/chat
 *   body: { messages: [{ role: "user" | "assistant", text: string }, ...] }
 *   The last message must be from the user. History is capped server-side.
 *
 * Requires GEMINI_API_KEY in backend/.env (free key: https://aistudio.google.com).
 * Uses the REST API directly — no SDK dependency.
 */

const { pool } = require("../config/db");

// gemini-2.5-flash was retired for this API key; gemini-flash-latest always
// points at the current stable flash model.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 25000;
const MAX_HISTORY = 20; // cap turns sent to the model
const MAX_MSG_CHARS = 2000; // cap a single message length

const SYSTEM_PROMPT = `You are "Recruweb Assistant", the helpful AI assistant for the Recruweb sales portal.

About the platform:
- Recruweb is a sales portal where products are sold through two categories of sales people:
  1. Field Sales Person — works an assigned territory ("beat"), has beat plans, monthly targets set by the admin, and earns commission on orders.
  2. Independent Seller — anyone can join and sell from anywhere; no territory or beat plan required, still earns commission on every sale.
- Roles: Admin (manages catalog, officers, targets, reports), Client (vendor placing orders), and Sales Person (field or independent).
- Sales people can: manage their profile (bank details for payouts, photo, phone), browse the product catalog, create orders for customers, track order status, view earnings/commissions and reports, chat with the admin team, and manage CRM leads.
- Clients can browse the catalog, place orders, request returns/refunds, and chat with support.
- To join as a seller: use the "Join" page, pick Field Sales Person or Independent Seller, fill in details, and the team calls within 24 hours.

Your job:
- Answer questions about how to use the portal, selling, orders, commissions, joining, and features.
- Be concise, friendly, and practical. Use short paragraphs or bullet lists.
- If asked something unrelated to the portal or selling, politely steer back or give a one-line general answer.
- Never invent specific numbers (commission rates, prices, targets) — tell the user where to find them in the portal or to ask the admin via the support chat.
- Reply in the same language the user writes in.`;

// Per-role navigation guide so the assistant gives accurate "where do I click" answers.
const ROLE_GUIDE = {
  client: `The user is a CLIENT (vendor). Their portal pages:
- /client — dashboard (sales overview)
- /client/products — their product catalog (Add Product button opens the submission form; new products go to admin review before going live)
- /client/orders — orders placed for their products
- /client/returns — returns & refunds tracking
- /client/chat — support chat with the admin team
- /client/settings — profile settings`,
  field: `The user is a SALES PERSON (field officer / independent seller). Their portal pages:
- /field — "My Day" dashboard (beat plan, visits, tasks)
- /field/leads — CRM leads (add shops/leads, log follow-ups)
- /field/orders — create & track customer orders
- /field/earnings — commissions and wallet (pending / available / withdrawn)
- /field/kyc — KYC document upload (PAN etc.; required before payouts)
- /field/chat — chat with the admin team
- /field/settings — profile & bank details for payouts`,
  admin: `The user is the SUPER ADMIN. Their portal pages:
- /admin — dashboard (GMV, officers, clients, products)
- /admin/products — product review queue (approve/reject vendor products; search applies on Enter)
- /admin/kyc — KYC review (approve/reject seller documents)
- /admin/users — user management
- /admin/orders — all orders
- /admin/commissions — officer commission management
- /admin/payouts — payout requests
- /admin/reports — analytics & reports
- /admin/chat — support inbox (replies to clients and officers)`,
};

/**
 * Pull a small, per-role snapshot of live data from MySQL so the assistant
 * can answer "how many orders do I have?"-style questions with real numbers.
 * Fails soft: on any error the assistant simply gets no live data.
 */
async function buildLiveContext(user) {
  // JWT payload stores the user id in `sub`.
  const userId = user.sub || user.id;
  let identity = "";
  try {
    const [idRows] = await pool.query(
      `SELECT u.full_name, u.email, p.phone, p.city, p.seller_category
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [userId]
    );
    const me = idRows[0];
    if (me) {
      identity = `The user's profile: name "${me.full_name || "not set"}", email ${me.email}${me.phone ? `, phone ${me.phone}` : ""}${me.city ? `, city ${me.city}` : ""}${me.seller_category ? `, seller category ${me.seller_category}` : ""}.\n`;
    }
  } catch (err) {
    console.error("[assistant] identity lookup failed:", err.message);
  }
  try {
    if (user.role === "client") {
      const [orders, returns, products] = await Promise.all([
        pool.query(
          "SELECT COUNT(*) AS total, COALESCE(SUM(amount),0) AS revenue, SUM(status='delivered') AS delivered, SUM(status NOT IN ('delivered','cancelled')) AS in_progress FROM orders WHERE client_id = ?",
          [userId]
        ),
        pool.query(
          "SELECT COUNT(*) AS total, SUM(status IN ('requested','approved','pickup_scheduled','in_transit','received','refund_initiated')) AS open_returns FROM returns WHERE client_id = ?",
          [userId]
        ),
        pool.query(
          "SELECT COUNT(*) AS total, SUM(status='live') AS live, SUM(status='review') AS in_review, SUM(status='rejected') AS rejected FROM products WHERE owner_id = ?",
          [userId]
        ),
      ]).then((rs) => rs.map(([rows]) => rows));
      const o = orders[0] || {}, r = returns[0] || {}, p = products[0] || {};
      return identity + `Live account data (right now, from the database):
- Orders: ${o.total || 0} total (₹${Number(o.revenue || 0).toLocaleString("en-IN")} revenue), ${o.delivered || 0} delivered, ${o.in_progress || 0} in progress
- Returns: ${r.total || 0} total, ${r.open_returns || 0} still open
- Products: ${p.total || 0} total — ${p.live || 0} live, ${p.in_review || 0} awaiting admin review (status: review), ${p.rejected || 0} rejected`;
    }
    if (user.role === "field") {
      const [leads, comm, wallet, kyc] = await Promise.all([
        pool.query(
          "SELECT COUNT(*) AS total, SUM(status='new') AS new_leads, SUM(status='converted') AS converted FROM leads WHERE officer_id = ?",
          [userId]
        ),
        pool.query(
          "SELECT COALESCE(SUM(amount),0) AS earned, COALESCE(SUM(CASE WHEN status='pending' THEN amount END),0) AS pending FROM commissions WHERE officer_id = ?",
          [userId]
        ),
        pool.query(
          "SELECT pending_amount, available_amount, withdrawn_amount FROM officer_wallets WHERE officer_id = ?",
          [userId]
        ),
        pool.query(
          "SELECT status FROM kyc_submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
          [userId]
        ),
      ]).then((rs) => rs.map(([rows]) => rows));
      const l = leads[0] || {}, c = comm[0] || {}, w = wallet[0], k = kyc[0];
      return identity + `Live account data (right now, from the database):
- Leads: ${l.total || 0} total, ${l.new_leads || 0} new, ${l.converted || 0} converted
- Commissions: ₹${Number(c.earned || 0).toLocaleString("en-IN")} earned total, ₹${Number(c.pending || 0).toLocaleString("en-IN")} pending
- Wallet: ${w ? `₹${Number(w.available_amount).toLocaleString("en-IN")} available, ₹${Number(w.pending_amount).toLocaleString("en-IN")} pending, ₹${Number(w.withdrawn_amount).toLocaleString("en-IN")} withdrawn` : "not set up yet"}
- KYC status: ${k ? k.status : "not started"} ${k && k.status !== "approved" ? "(KYC approval is required before payouts)" : ""}`;
    }
    if (user.role === "admin") {
      const [stats] = await Promise.all([
        pool.query(
          `SELECT
            (SELECT COUNT(*) FROM products WHERE status='review') AS products_in_review,
            (SELECT COUNT(*) FROM kyc_submissions WHERE status='pending') AS kyc_pending,
            (SELECT COUNT(*) FROM orders WHERE created_at >= CURDATE()) AS orders_today,
            (SELECT COALESCE(SUM(amount),0) FROM orders WHERE status != 'cancelled') AS gmv,
            (SELECT COUNT(*) FROM users WHERE role='field') AS officers,
            (SELECT COUNT(*) FROM users WHERE role='client') AS clients,
            (SELECT COUNT(*) FROM returns WHERE status='requested') AS returns_requested`
        ),
      ]).then((rs) => rs.map(([rows]) => rows));
      const s = stats[0] || {};
      return identity + `Live platform data (right now, from the database):
- Review queues: ${s.products_in_review || 0} products awaiting review, ${s.kyc_pending || 0} KYC submissions pending, ${s.returns_requested || 0} return requests awaiting action
- Today: ${s.orders_today || 0} orders placed
- Totals: ₹${Number(s.gmv || 0).toLocaleString("en-IN")} GMV, ${s.officers || 0} sales officers, ${s.clients || 0} clients`;
    }
  } catch (err) {
    console.error("[assistant] live context failed:", err.message);
  }
  return identity;
}

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const msgs = raw
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.text === "string" &&
        m.text.trim() !== ""
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role,
      text: m.text.trim().slice(0, MAX_MSG_CHARS),
    }));
  if (msgs.length === 0) return null;
  if (msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

async function chatWithAssistant(req, res) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(503).json({
      error:
        "AI assistant is not configured yet. Add GEMINI_API_KEY to backend/.env (free key at aistudio.google.com) and restart the backend.",
    });
  }

  const messages = sanitizeMessages((req.body || {}).messages);
  if (!messages) {
    return res.status(422).json({
      error: "Send { messages: [{ role, text }, ...] } ending with a user message.",
    });
  }

  // Gemini uses "user" / "model" roles.
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));

  // Role-aware context: who the user is, their pages, and live numbers.
  const roleGuide = ROLE_GUIDE[req.user.role] || "";
  const liveContext = await buildLiveContext(req.user);
  const systemPrompt = [
    SYSTEM_PROMPT,
    roleGuide,
    liveContext,
    "Keep answers short and conversational (1-4 sentences) — they may be read aloud by a voice assistant. Use the live data above when the user asks about their numbers. Never reveal data belonging to other users.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Fallback chain: free-tier quotas are PER MODEL, so when one model is
  // rate-limited (429) or retired (404) we try the next instead of failing.
  const modelChain = [
    ...new Set([
      GEMINI_MODEL,
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ]),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
    },
  });

  try {
    let lastStatus = 0;
    for (const model of modelChain) {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body,
          signal: controller.signal,
        }
      );

      if (!upstream.ok) {
        lastStatus = upstream.status;
        const detail = await upstream.text().catch(() => "");
        console.error(
          `[assistant] Gemini error (${model})`,
          upstream.status,
          detail.slice(0, 300)
        );
        // 429 = this model's quota is used up; 404 = model retired for this
        // key; 503 = temporary overload. All are worth trying the next model.
        if ([429, 404, 503].includes(upstream.status)) continue;
        // NOTE: never return 502/504 - Cloudflare tunnels replace those with
        // their own HTML error page, so the frontend can't read the JSON.
        return res.status(500).json({
          error: "The assistant could not process that right now. Please try again.",
        });
      }

      const data = await upstream.json();
      const reply =
        data?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || "")
          .join("")
          .trim() || "";

      if (!reply) continue; // empty candidate - try the next model

      return res.json({ reply });
    }

    // Every model in the chain failed.
    const msg =
      lastStatus === 429
        ? "The assistant has hit its daily usage limit. Please try again later."
        : "The assistant could not answer right now. Please try again.";
    return res.status(lastStatus === 429 ? 429 : 500).json({ error: msg });
  } catch (err) {
    const timedOut = err && err.name === "AbortError";
    console.error("[assistant] request failed:", timedOut ? "timeout" : err.message);
    return res.status(500).json({
      error: timedOut
        ? "The assistant took too long to reply. Please try again."
        : "Could not reach the assistant. Please try again.",
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatWithAssistant };
