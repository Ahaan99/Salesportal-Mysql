const { supabaseAdmin } = require("../config/supabase");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const trimmed = (v, max) => String(v ?? "").trim().slice(0, max);
const clamp = (n, min, max, fb) => { const v = parseInt(n, 10); return isNaN(v) ? fb : Math.min(Math.max(v, min), max); };

const LEAD_POTENTIALS = ["hot", "warm", "cold"];
const LEAD_STATUSES   = ["new", "contacted", "interested", "not_interested", "converted", "lost"];
const FOLLOWUP_TYPES  = ["call", "visit", "whatsapp", "email"];
const FOLLOWUP_STATUSES = ["pending", "done", "missed", "cancelled"];
const TASK_PRIORITIES = ["high", "medium", "low"];
const TASK_STATUSES   = ["pending", "in_progress", "done", "cancelled"];
const MEETING_STATUSES = ["scheduled", "completed", "cancelled", "no_show"];

/* ==================================================================
   LEADS
   ================================================================== */

async function listLeads(req, res) {
  try {
    const officerId = req.user.id;
    const page      = clamp(req.query.page, 1, 500, 1);
    const pageSize  = clamp(req.query.page_size, 1, 100, 20);
    const offset    = (page - 1) * pageSize;
    const status    = LEAD_STATUSES.includes(req.query.status) ? req.query.status : null;
    const potential = LEAD_POTENTIALS.includes(req.query.potential) ? req.query.potential : null;

    let q = supabaseAdmin
      .from("leads")
      .select("*", { count: "exact" })
      .eq("officer_id", officerId);

    if (status)    q = q.eq("status", status);
    if (potential) q = q.eq("potential", potential);

    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[crm:leads:list]", error.message);
      return res.status(500).json({ error: "Could not load leads." });
    }
    return res.json({ leads: data ?? [], total: count ?? 0, page, page_size: pageSize });
  } catch (err) {
    console.error("[crm:leads:list]", err.message);
    return res.status(500).json({ error: "Could not load leads." });
  }
}

async function createLead(req, res) {
  try {
    const body = req.body || {};
    const shopName  = trimmed(body.shop_name, 200);
    const ownerName = trimmed(body.owner_name, 160);
    if (!shopName)  return res.status(422).json({ error: "shop_name is required." });
    if (!ownerName) return res.status(422).json({ error: "owner_name is required." });

    const potential = LEAD_POTENTIALS.includes(body.potential) ? body.potential : "warm";
    const status    = LEAD_STATUSES.includes(body.status) ? body.status : "new";

    const { data, error } = await supabaseAdmin
      .from("leads")
      .insert({
        officer_id:        req.user.id,
        shop_name:         shopName,
        owner_name:        ownerName,
        phone:             trimmed(body.phone, 20) || null,
        area:              trimmed(body.area, 200) || null,
        city:              trimmed(body.city, 100) || null,
        state:             trimmed(body.state, 100) || null,
        potential,
        status,
        suggested_products: Array.isArray(body.suggested_products) ? body.suggested_products.map(s => String(s).slice(0, 200)) : [],
        notes:             trimmed(body.notes, 2000) || null,
        last_contact_at:   body.last_contact_at || null,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[crm:leads:create]", error.message);
      return res.status(500).json({ error: "Could not create lead." });
    }
    return res.status(201).json({ lead: data });
  } catch (err) {
    console.error("[crm:leads:create]", err.message);
    return res.status(500).json({ error: "Could not create lead." });
  }
}

async function getLead(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid lead ID." });

    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("*, lead_follow_ups(*), lead_notes(*)")
      .eq("id", id)
      .eq("officer_id", req.user.id)
      .maybeSingle();

    if (error) { console.error("[crm:leads:get]", error.message); return res.status(500).json({ error: "Could not load lead." }); }
    if (!data) return res.status(404).json({ error: "Lead not found." });
    return res.json({ lead: data });
  } catch (err) {
    console.error("[crm:leads:get]", err.message);
    return res.status(500).json({ error: "Could not load lead." });
  }
}

async function updateLead(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid lead ID." });
    const body = req.body || {};

    const updates = {};
    if (body.shop_name  !== undefined) updates.shop_name  = trimmed(body.shop_name, 200);
    if (body.owner_name !== undefined) updates.owner_name = trimmed(body.owner_name, 160);
    if (body.phone      !== undefined) updates.phone      = trimmed(body.phone, 20) || null;
    if (body.area       !== undefined) updates.area       = trimmed(body.area, 200) || null;
    if (body.city       !== undefined) updates.city       = trimmed(body.city, 100) || null;
    if (body.state      !== undefined) updates.state      = trimmed(body.state, 100) || null;
    if (body.notes      !== undefined) updates.notes      = trimmed(body.notes, 2000) || null;
    if (LEAD_POTENTIALS.includes(body.potential)) updates.potential = body.potential;
    if (LEAD_STATUSES.includes(body.status))      updates.status    = body.status;
    if (body.last_contact_at !== undefined) updates.last_contact_at = body.last_contact_at || null;
    if (Array.isArray(body.suggested_products)) {
      updates.suggested_products = body.suggested_products.map(s => String(s).slice(0, 200));
    }

    const { data, error } = await supabaseAdmin
      .from("leads")
      .update(updates)
      .eq("id", id)
      .eq("officer_id", req.user.id)
      .select("*")
      .single();

    if (error) { console.error("[crm:leads:update]", error.message); return res.status(500).json({ error: "Could not update lead." }); }
    if (!data) return res.status(404).json({ error: "Lead not found." });
    return res.json({ lead: data });
  } catch (err) {
    console.error("[crm:leads:update]", err.message);
    return res.status(500).json({ error: "Could not update lead." });
  }
}

async function deleteLead(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid lead ID." });

    const { error } = await supabaseAdmin
      .from("leads")
      .delete()
      .eq("id", id)
      .eq("officer_id", req.user.id);

    if (error) { console.error("[crm:leads:delete]", error.message); return res.status(500).json({ error: "Could not delete lead." }); }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[crm:leads:delete]", err.message);
    return res.status(500).json({ error: "Could not delete lead." });
  }
}

/* ==================================================================
   FOLLOW-UPS
   ================================================================== */

async function listFollowUps(req, res) {
  try {
    const { id: leadId } = req.params;
    if (!UUID_RE.test(leadId)) return res.status(400).json({ error: "Invalid lead ID." });

    const { data, error } = await supabaseAdmin
      .from("lead_follow_ups")
      .select("*")
      .eq("lead_id", leadId)
      .eq("officer_id", req.user.id)
      .order("scheduled_at", { ascending: true });

    if (error) { console.error("[crm:followups:list]", error.message); return res.status(500).json({ error: "Could not load follow-ups." }); }
    return res.json({ follow_ups: data ?? [] });
  } catch (err) {
    console.error("[crm:followups:list]", err.message);
    return res.status(500).json({ error: "Could not load follow-ups." });
  }
}

async function createFollowUp(req, res) {
  try {
    const { id: leadId } = req.params;
    if (!UUID_RE.test(leadId)) return res.status(400).json({ error: "Invalid lead ID." });
    const body = req.body || {};

    if (!body.scheduled_at) return res.status(422).json({ error: "scheduled_at is required." });
    const type = FOLLOWUP_TYPES.includes(body.type) ? body.type : "call";

    const { data, error } = await supabaseAdmin
      .from("lead_follow_ups")
      .insert({
        lead_id:      leadId,
        officer_id:   req.user.id,
        type,
        scheduled_at: body.scheduled_at,
        notes:        trimmed(body.notes, 1000) || null,
      })
      .select("*")
      .single();

    if (error) { console.error("[crm:followups:create]", error.message); return res.status(500).json({ error: "Could not create follow-up." }); }
    return res.status(201).json({ follow_up: data });
  } catch (err) {
    console.error("[crm:followups:create]", err.message);
    return res.status(500).json({ error: "Could not create follow-up." });
  }
}

async function updateFollowUp(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid follow-up ID." });
    const body = req.body || {};

    const updates = {};
    if (FOLLOWUP_STATUSES.includes(body.status)) updates.status = body.status;
    if (FOLLOWUP_TYPES.includes(body.type))       updates.type   = body.type;
    if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;
    if (body.completed_at !== undefined) updates.completed_at = body.completed_at || null;
    if (body.notes        !== undefined) updates.notes        = trimmed(body.notes, 1000) || null;
    if (body.status === "done" && !updates.completed_at) updates.completed_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("lead_follow_ups")
      .update(updates)
      .eq("id", id)
      .eq("officer_id", req.user.id)
      .select("*")
      .single();

    if (error) { console.error("[crm:followups:update]", error.message); return res.status(500).json({ error: "Could not update follow-up." }); }
    if (!data) return res.status(404).json({ error: "Follow-up not found." });
    return res.json({ follow_up: data });
  } catch (err) {
    console.error("[crm:followups:update]", err.message);
    return res.status(500).json({ error: "Could not update follow-up." });
  }
}

async function deleteFollowUp(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid follow-up ID." });
    const { error } = await supabaseAdmin.from("lead_follow_ups").delete().eq("id", id).eq("officer_id", req.user.id);
    if (error) { console.error("[crm:followups:delete]", error.message); return res.status(500).json({ error: "Could not delete follow-up." }); }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[crm:followups:delete]", err.message);
    return res.status(500).json({ error: "Could not delete follow-up." });
  }
}


async function listAllFollowUps(req, res) {
  try {
    const status = FOLLOWUP_STATUSES.includes(req.query.status) ? req.query.status : null;
    let q = supabaseAdmin
      .from("lead_follow_ups")
      .select("*, leads(shop_name, owner_name)", { count: "exact" })
      .eq("officer_id", req.user.id);
    if (status) q = q.eq("status", status);
    const { data, error, count } = await q.order("scheduled_at", { ascending: true });
    if (error) { console.error("[crm:followups:listAll]", error.message); return res.status(500).json({ error: "Could not load follow-ups." }); }
    return res.json({ follow_ups: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[crm:followups:listAll]", err.message);
    return res.status(500).json({ error: "Could not load follow-ups." });
  }
}

/* ==================================================================
   TASKS
   ================================================================== */

async function listTasks(req, res) {
  try {
    const page     = clamp(req.query.page, 1, 500, 1);
    const pageSize = clamp(req.query.page_size, 1, 100, 30);
    const offset   = (page - 1) * pageSize;
    const status   = TASK_STATUSES.includes(req.query.status) ? req.query.status : null;

    let q = supabaseAdmin
      .from("crm_tasks")
      .select("*, leads(shop_name, owner_name)", { count: "exact" })
      .eq("officer_id", req.user.id);

    if (status) q = q.eq("status", status);

    const { data, error, count } = await q
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) { console.error("[crm:tasks:list]", error.message); return res.status(500).json({ error: "Could not load tasks." }); }
    return res.json({ tasks: data ?? [], total: count ?? 0, page, page_size: pageSize });
  } catch (err) {
    console.error("[crm:tasks:list]", err.message);
    return res.status(500).json({ error: "Could not load tasks." });
  }
}

async function createTask(req, res) {
  try {
    const body = req.body || {};
    const title = trimmed(body.title, 300);
    if (!title) return res.status(422).json({ error: "title is required." });

    const leadId = UUID_RE.test(body.lead_id) ? body.lead_id : null;
    const priority = TASK_PRIORITIES.includes(body.priority) ? body.priority : "medium";

    const { data, error } = await supabaseAdmin
      .from("crm_tasks")
      .insert({
        officer_id:  req.user.id,
        lead_id:     leadId,
        title,
        description: trimmed(body.description, 1000) || null,
        due_date:    body.due_date || null,
        priority,
      })
      .select("*, leads(shop_name, owner_name)")
      .single();

    if (error) { console.error("[crm:tasks:create]", error.message); return res.status(500).json({ error: "Could not create task." }); }
    return res.status(201).json({ task: data });
  } catch (err) {
    console.error("[crm:tasks:create]", err.message);
    return res.status(500).json({ error: "Could not create task." });
  }
}

async function updateTask(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid task ID." });
    const body = req.body || {};

    const updates = {};
    if (body.title       !== undefined) updates.title       = trimmed(body.title, 300);
    if (body.description !== undefined) updates.description = trimmed(body.description, 1000) || null;
    if (body.due_date    !== undefined) updates.due_date    = body.due_date || null;
    if (TASK_PRIORITIES.includes(body.priority)) updates.priority = body.priority;
    if (TASK_STATUSES.includes(body.status))     updates.status   = body.status;

    const { data, error } = await supabaseAdmin
      .from("crm_tasks")
      .update(updates)
      .eq("id", id)
      .eq("officer_id", req.user.id)
      .select("*, leads(shop_name, owner_name)")
      .single();

    if (error) { console.error("[crm:tasks:update]", error.message); return res.status(500).json({ error: "Could not update task." }); }
    if (!data) return res.status(404).json({ error: "Task not found." });
    return res.json({ task: data });
  } catch (err) {
    console.error("[crm:tasks:update]", err.message);
    return res.status(500).json({ error: "Could not update task." });
  }
}

async function deleteTask(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid task ID." });
    const { error } = await supabaseAdmin.from("crm_tasks").delete().eq("id", id).eq("officer_id", req.user.id);
    if (error) { console.error("[crm:tasks:delete]", error.message); return res.status(500).json({ error: "Could not delete task." }); }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[crm:tasks:delete]", err.message);
    return res.status(500).json({ error: "Could not delete task." });
  }
}

/* ==================================================================
   MEETINGS
   ================================================================== */

async function listMeetings(req, res) {
  try {
    const page      = clamp(req.query.page, 1, 500, 1);
    const pageSize  = clamp(req.query.page_size, 1, 100, 20);
    const offset    = (page - 1) * pageSize;
    const status    = MEETING_STATUSES.includes(req.query.status) ? req.query.status : null;
    const upcoming  = req.query.upcoming === "1";

    let q = supabaseAdmin
      .from("meetings")
      .select("*, leads(shop_name, owner_name)", { count: "exact" })
      .eq("officer_id", req.user.id);

    if (status)  q = q.eq("status", status);
    if (upcoming) q = q.gte("scheduled_at", new Date().toISOString());

    const { data, error, count } = await q
      .order("scheduled_at", { ascending: upcoming || !status })
      .range(offset, offset + pageSize - 1);

    if (error) { console.error("[crm:meetings:list]", error.message); return res.status(500).json({ error: "Could not load meetings." }); }
    return res.json({ meetings: data ?? [], total: count ?? 0, page, page_size: pageSize });
  } catch (err) {
    console.error("[crm:meetings:list]", err.message);
    return res.status(500).json({ error: "Could not load meetings." });
  }
}

async function createMeeting(req, res) {
  try {
    const body = req.body || {};
    const title = trimmed(body.title, 300);
    if (!title)               return res.status(422).json({ error: "title is required." });
    if (!body.scheduled_at)   return res.status(422).json({ error: "scheduled_at is required." });

    const leadId = UUID_RE.test(body.lead_id) ? body.lead_id : null;

    const { data, error } = await supabaseAdmin
      .from("meetings")
      .insert({
        officer_id:       req.user.id,
        lead_id:          leadId,
        title,
        customer_name:    trimmed(body.customer_name, 160) || null,
        location:         trimmed(body.location, 300) || null,
        scheduled_at:     body.scheduled_at,
        duration_minutes: clamp(body.duration_minutes, 5, 480, 30),
        notes:            trimmed(body.notes, 2000) || null,
      })
      .select("*, leads(shop_name, owner_name)")
      .single();

    if (error) { console.error("[crm:meetings:create]", error.message); return res.status(500).json({ error: "Could not create meeting." }); }
    return res.status(201).json({ meeting: data });
  } catch (err) {
    console.error("[crm:meetings:create]", err.message);
    return res.status(500).json({ error: "Could not create meeting." });
  }
}

async function updateMeeting(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid meeting ID." });
    const body = req.body || {};

    const updates = {};
    if (body.title         !== undefined) updates.title         = trimmed(body.title, 300);
    if (body.customer_name !== undefined) updates.customer_name = trimmed(body.customer_name, 160) || null;
    if (body.location      !== undefined) updates.location      = trimmed(body.location, 300) || null;
    if (body.scheduled_at  !== undefined) updates.scheduled_at  = body.scheduled_at;
    if (body.notes         !== undefined) updates.notes         = trimmed(body.notes, 2000) || null;
    if (MEETING_STATUSES.includes(body.status)) updates.status  = body.status;
    if (body.duration_minutes !== undefined) updates.duration_minutes = clamp(body.duration_minutes, 5, 480, 30);

    const { data, error } = await supabaseAdmin
      .from("meetings")
      .update(updates)
      .eq("id", id)
      .eq("officer_id", req.user.id)
      .select("*, leads(shop_name, owner_name)")
      .single();

    if (error) { console.error("[crm:meetings:update]", error.message); return res.status(500).json({ error: "Could not update meeting." }); }
    if (!data) return res.status(404).json({ error: "Meeting not found." });
    return res.json({ meeting: data });
  } catch (err) {
    console.error("[crm:meetings:update]", err.message);
    return res.status(500).json({ error: "Could not update meeting." });
  }
}

async function deleteMeeting(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid meeting ID." });
    const { error } = await supabaseAdmin.from("meetings").delete().eq("id", id).eq("officer_id", req.user.id);
    if (error) { console.error("[crm:meetings:delete]", error.message); return res.status(500).json({ error: "Could not delete meeting." }); }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[crm:meetings:delete]", err.message);
    return res.status(500).json({ error: "Could not delete meeting." });
  }
}

/* ==================================================================
   NOTES
   ================================================================== */

async function listNotes(req, res) {
  try {
    const { id: leadId } = req.params;
    if (!UUID_RE.test(leadId)) return res.status(400).json({ error: "Invalid lead ID." });

    const { data, error } = await supabaseAdmin
      .from("lead_notes")
      .select("*")
      .eq("lead_id", leadId)
      .eq("officer_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) { console.error("[crm:notes:list]", error.message); return res.status(500).json({ error: "Could not load notes." }); }
    return res.json({ notes: data ?? [] });
  } catch (err) {
    console.error("[crm:notes:list]", err.message);
    return res.status(500).json({ error: "Could not load notes." });
  }
}

async function createNote(req, res) {
  try {
    const { id: leadId } = req.params;
    if (!UUID_RE.test(leadId)) return res.status(400).json({ error: "Invalid lead ID." });
    const content = trimmed(req.body?.content, 2000);
    if (!content) return res.status(422).json({ error: "content is required." });

    const { data, error } = await supabaseAdmin
      .from("lead_notes")
      .insert({ lead_id: leadId, officer_id: req.user.id, content })
      .select("*")
      .single();

    if (error) { console.error("[crm:notes:create]", error.message); return res.status(500).json({ error: "Could not create note." }); }
    return res.status(201).json({ note: data });
  } catch (err) {
    console.error("[crm:notes:create]", err.message);
    return res.status(500).json({ error: "Could not create note." });
  }
}

async function deleteNote(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid note ID." });
    const { error } = await supabaseAdmin.from("lead_notes").delete().eq("id", id).eq("officer_id", req.user.id);
    if (error) { console.error("[crm:notes:delete]", error.message); return res.status(500).json({ error: "Could not delete note." }); }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[crm:notes:delete]", err.message);
    return res.status(500).json({ error: "Could not delete note." });
  }
}

module.exports = {
  listLeads, createLead, getLead, updateLead, deleteLead,
  listAllFollowUps, listFollowUps, createFollowUp, updateFollowUp, deleteFollowUp,
  listTasks, createTask, updateTask, deleteTask,
  listMeetings, createMeeting, updateMeeting, deleteMeeting,
  listNotes, createNote, deleteNote,
};
