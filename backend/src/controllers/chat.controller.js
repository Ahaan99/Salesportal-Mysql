const { supabaseAdmin } = require("../config/supabase");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 2000;
const MESSAGE_PAGE = 200;
const PREVIEW_LEN = 140;

function preview(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > PREVIEW_LEN ? `${clean.slice(0, PREVIEW_LEN - 1)}…` : clean;
}

function validateBody(raw) {
  if (typeof raw !== "string") return { error: "Message text is required." };
  const text = raw.trim();
  if (!text) return { error: "Message cannot be empty." };
  if (text.length > MAX_BODY) {
    return { error: `Message is too long (max ${MAX_BODY} characters).` };
  }
  return { text };
}

/**
 * Get (or lazily create) the support thread for the signed-in
 * participant. Uses upsert on the unique participant_id so two
 * concurrent first-messages can never create duplicate threads.
 */
async function getOrCreateThread(user) {
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("chat_threads")
    .select("*")
    .eq("participant_id", user.id)
    .maybeSingle();

  if (selErr) throw new Error(`thread lookup failed: ${selErr.message}`);
  if (existing) return existing;

  const { data: created, error: insErr } = await supabaseAdmin
    .from("chat_threads")
    .upsert(
      {
        participant_id: user.id,
        participant_name: (user.fullName || user.email || "Member").slice(0, 120),
        participant_role: user.role === "field" ? "field" : "client",
      },
      { onConflict: "participant_id" }
    )
    .select()
    .single();

  if (insErr) throw new Error(`thread create failed: ${insErr.message}`);
  return created;
}

async function loadMessages(threadId) {
  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id, sender_role, body, status, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(MESSAGE_PAGE);

  if (error) throw new Error(`messages load failed: ${error.message}`);
  return data ?? [];
}

/** Mark the other side's messages as read + zero my unread counter. */
async function markRead(threadId, otherSenderRole, unreadColumn) {
  const { error: msgErr } = await supabaseAdmin
    .from("chat_messages")
    .update({ status: "read" })
    .eq("thread_id", threadId)
    .eq("sender_role", otherSenderRole)
    .neq("status", "read");
  if (msgErr) console.error("[chat:mark-read] messages update failed:", msgErr.message);

  const { error: thrErr } = await supabaseAdmin
    .from("chat_threads")
    .update({ [unreadColumn]: 0 })
    .eq("id", threadId);
  if (thrErr) console.error("[chat:mark-read] thread update failed:", thrErr.message);
}

/**
 * Atomically set the thread preview and bump ONE unread counter via the
 * chat_bump_thread SQL function (single UPDATE — no lost increments under
 * concurrent sends). Falls back to the legacy read-modify-write update if
 * the function is missing (migration not yet run), so sends never break.
 */
async function bumpThread({ threadId, text, createdAt, bumpAdmin, participantName, legacyUnread }) {
  const { error } = await supabaseAdmin.rpc("chat_bump_thread", {
    p_thread_id: threadId,
    p_last_message: preview(text),
    p_last_message_at: createdAt,
    p_bump_admin: bumpAdmin,
    p_participant_name: participantName ? participantName.slice(0, 120) : null,
  });
  if (!error) return;

  console.error("[chat:bump] rpc failed, using legacy update:", error.message);
  const unreadColumn = bumpAdmin ? "unread_for_admin" : "unread_for_participant";
  const patch = {
    last_message: preview(text),
    last_message_at: createdAt,
    [unreadColumn]: (legacyUnread ?? 0) + 1,
  };
  if (participantName) patch.participant_name = participantName.slice(0, 120);
  const { error: updErr } = await supabaseAdmin
    .from("chat_threads")
    .update(patch)
    .eq("id", threadId);
  if (updErr) console.error("[chat:bump] legacy thread update failed:", updErr.message);
}

/* ------------------------- participant endpoints ------------------------ */

/**
 * GET /api/chat/thread
 * The signed-in client/field officer's own support thread + messages.
 * Opening the thread marks admin replies as read.
 */
async function getMyThread(req, res) {
  try {
    const thread = await getOrCreateThread(req.user);
    const messages = await loadMessages(thread.id);
    await markRead(thread.id, "admin", "unread_for_participant");
    return res.json({
      thread: { ...thread, unread_for_participant: 0 },
      messages,
    });
  } catch (err) {
    console.error("[chat:my-thread]", err.message);
    return res.status(500).json({ error: "Could not load your conversation." });
  }
}

/**
 * GET /api/chat/thread/summary
 * Lightweight unread badge poll — does NOT mark anything read.
 */
async function getMyThreadSummary(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from("chat_threads")
      .select("id, unread_for_participant, last_message, last_message_at")
      .eq("participant_id", req.user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return res.json({
      unread: data?.unread_for_participant ?? 0,
      last_message: data?.last_message ?? null,
      last_message_at: data?.last_message_at ?? null,
    });
  } catch (err) {
    console.error("[chat:my-summary]", err.message);
    return res.status(500).json({ error: "Could not load chat status." });
  }
}

/**
 * POST /api/chat/messages   { text }
 * Participant sends a message on their own thread.
 */
async function postMyMessage(req, res) {
  try {
    const { text, error } = validateBody(req.body?.text);
    if (error) return res.status(400).json({ error });

    const thread = await getOrCreateThread(req.user);

    const { data: message, error: msgErr } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        thread_id: thread.id,
        sender_id: req.user.id,
        sender_role: "participant",
        body: text,
        status: "delivered",
      })
      .select("id, sender_role, body, status, created_at")
      .single();

    if (msgErr) throw new Error(msgErr.message);

    await bumpThread({
      threadId: thread.id,
      text,
      createdAt: message.created_at,
      bumpAdmin: true,
      participantName: req.user.fullName || thread.participant_name,
      legacyUnread: thread.unread_for_admin,
    });

    return res.status(201).json(message);
  } catch (err) {
    console.error("[chat:send]", err.message);
    return res.status(500).json({ error: "Could not send your message. Please retry." });
  }
}

/* ---------------------------- admin endpoints --------------------------- */

/**
 * GET /api/chat/threads
 * Admin inbox: every thread, newest activity first.
 */
async function adminListThreads(req, res) {
  try {
    let query = supabaseAdmin
      .from("chat_threads")
      .select(
        "id, participant_id, participant_name, participant_role, last_message, last_message_at, unread_for_admin, created_at"
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);

    const role = (req.query.role ?? "").toString().trim();
    if (role === "client" || role === "field") {
      query = query.eq("participant_role", role);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return res.json({ threads: data ?? [] });
  } catch (err) {
    console.error("[chat:admin-list]", err.message);
    return res.status(500).json({ error: "Could not load conversations." });
  }
}

/**
 * GET /api/chat/threads/:id
 * Admin opens a thread — returns messages and marks them read.
 */
async function adminGetThread(req, res) {
  try {
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: "Conversation not found." });

    const { data: thread, error } = await supabaseAdmin
      .from("chat_threads")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!thread) return res.status(404).json({ error: "Conversation not found." });

    const messages = await loadMessages(thread.id);
    await markRead(thread.id, "participant", "unread_for_admin");

    return res.json({ thread: { ...thread, unread_for_admin: 0 }, messages });
  } catch (err) {
    console.error("[chat:admin-get]", err.message);
    return res.status(500).json({ error: "Could not load the conversation." });
  }
}

/**
 * POST /api/chat/threads/:id/messages   { text }
 * Admin replies into a participant's thread.
 */
async function adminPostMessage(req, res) {
  try {
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: "Conversation not found." });

    const { text, error } = validateBody(req.body?.text);
    if (error) return res.status(400).json({ error });

    const { data: thread, error: thrErr } = await supabaseAdmin
      .from("chat_threads")
      .select("id, unread_for_participant")
      .eq("id", id)
      .maybeSingle();

    if (thrErr) throw new Error(thrErr.message);
    if (!thread) return res.status(404).json({ error: "Conversation not found." });

    const { data: message, error: msgErr } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        thread_id: thread.id,
        sender_id: req.user.id,
        sender_role: "admin",
        body: text,
        status: "delivered",
      })
      .select("id, sender_role, body, status, created_at")
      .single();

    if (msgErr) throw new Error(msgErr.message);

    await bumpThread({
      threadId: thread.id,
      text,
      createdAt: message.created_at,
      bumpAdmin: false,
      legacyUnread: thread.unread_for_participant,
    });

    return res.status(201).json(message);
  } catch (err) {
    console.error("[chat:admin-send]", err.message);
    return res.status(500).json({ error: "Could not send your reply. Please retry." });
  }
}

module.exports = {
  getMyThread,
  getMyThreadSummary,
  postMyMessage,
  adminListThreads,
  adminGetThread,
  adminPostMessage,
};
