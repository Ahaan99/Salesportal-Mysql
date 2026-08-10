const { supabaseAdmin } = require("../config/supabase");
const multer = require("multer");

const { saveFile, deleteFile, signDownloadToken } = require("../config/fileStorage");

const DOC_TYPES = ["pan","driving_license","passport","voter_id","gst","bank_statement","shop_photo"];
const ALLOWED_MIME = ["image/jpeg","image/png","image/webp","image/heic","image/heif","application/pdf"];
const clamp = (n, lo, hi, fb) => { const v = parseInt(n, 10); return isNaN(v) ? fb : Math.min(Math.max(v, lo), hi); };

/* ── Multer (memory storage, 10 MB cap) ─────────────────────────── */
const _upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true); // multer v2 requires explicit true to accept
    } else {
      cb(Object.assign(new Error("Only JPEG, PNG, WebP, HEIC and PDF files are allowed."), { code: "LIMIT_FILE_TYPE" }));
    }
  },
});

/* ── Storage helpers ────────────────────────────────────────────── */
// Local disk storage (backend/uploads/kyc-docs) — no bucket setup needed.

/* ── DB helpers ─────────────────────────────────────────────────── */
async function getOrCreateSubmission(userId, userRole) {
  const { data: existing } = await supabaseAdmin
    .from("kyc_submissions").select("*").eq("user_id", userId).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabaseAdmin
    .from("kyc_submissions")
    .insert({ user_id: userId, user_role: userRole, status: "draft" })
    .select().single();
  if (error) throw error;
  return data;
}

async function fetchProfilesMap(userIds) {
  if (!userIds.length) return {};
  const { data } = await supabaseAdmin
    .from("profiles").select("user_id, full_name, phone, city, state").in("user_id", userIds);
  return Object.fromEntries((data ?? []).map(p => [p.user_id, p]));
}

/* ═══════════════════════════════════════════════════════════════
   SHARED HANDLERS (used by both field and client routes)
   ═══════════════════════════════════════════════════════════════ */

/** GET /api/field/kyc/me  OR  GET /api/client/kyc/me */
async function getMyKyc(req, res) {
  try {
    const sub = await getOrCreateSubmission(req.user.id, req.user.role);
    const { data: docs } = await supabaseAdmin
      .from("kyc_documents")
      .select("id, doc_type, file_name, file_size, mime_type, uploaded_at")
      .eq("submission_id", sub.id)
      .order("uploaded_at", { ascending: true });
    return res.json({ submission: sub, documents: docs ?? [] });
  } catch (err) {
    console.error("[kyc:getMyKyc]", err.message);
    return res.status(500).json({ error: "Could not load KYC data." });
  }
}

/** POST /api/field/kyc/documents  OR  POST /api/client/kyc/documents
 *  Multipart: field = "file", body.doc_type
 *  FIX: use storage_path (not file_path) to match DB schema
 */
async function uploadDocument(req, res) {
  try {
    const { doc_type } = req.body ?? {};
    if (!DOC_TYPES.includes(doc_type))
      return res.status(400).json({ error: "Invalid document type." });
    if (!req.file)
      return res.status(400).json({ error: "No file uploaded. Allowed formats: JPEG, PNG, WebP, HEIC, PDF (max 10 MB)." });


    const sub = await getOrCreateSubmission(req.user.id, req.user.role);
    if (!["draft", "rejected"].includes(sub.status))
      return res.status(409).json({ error: `KYC is currently "${sub.status}" — documents cannot be changed.` });

    const ext        = (req.file.originalname.split(".").pop() || "bin").toLowerCase();
    const storagePath = `${req.user.id}/${sub.id}/${doc_type}.${ext}`;

    try {
      await saveFile(storagePath, req.file.buffer);
    } catch (storageErr) {
      console.error("[kyc:upload:storage]", storageErr.message);
      return res.status(500).json({ error: "File storage failed: " + storageErr.message });
    }

    // FIX: column is storage_path (not file_path)
    const { data: doc, error: dbErr } = await supabaseAdmin
      .from("kyc_documents")
      .upsert(
        {
          submission_id: sub.id,
          user_id:       req.user.id,
          doc_type,
          storage_path:  storagePath,   // ← was wrongly "file_path"
          file_name:     req.file.originalname,
          file_size:     req.file.size,
          mime_type:     req.file.mimetype,
          uploaded_at:   new Date().toISOString(),
        },
        { onConflict: "submission_id,doc_type" }
      )
      .select().single();

    if (dbErr) {
      console.error("[kyc:upload:db]", dbErr.message);
      return res.status(500).json({ error: "Failed to save document record: " + dbErr.message });
    }

    // The MySQL shim's upsert (INSERT ... ON DUPLICATE KEY UPDATE) can't
    // return the row — re-select it by its unique key instead.
    let document = doc;
    if (!document) {
      const { data: fetched } = await supabaseAdmin
        .from("kyc_documents")
        .select("id, doc_type, file_name, file_size, mime_type, uploaded_at")
        .eq("submission_id", sub.id)
        .eq("doc_type", doc_type)
        .single();
      document = fetched;
    }

    // Trigger in-app notification for admin about new document upload
    try {
      const { sendNotification } = require("../utils/notifications");
      await sendNotification({
        type: "kyc_document_uploaded",
        recipientRole: "admin",
        title: "New KYC Document Uploaded",
        message: `A ${req.user.role} user uploaded a ${doc_type.replace(/_/g, " ")} document.`,
        metadata: { submissionId: sub.id, userId: req.user.id, docType: doc_type },
      });
    } catch (_notifErr) { /* notifications are best-effort */ }

    return res.status(201).json({ document });
  } catch (err) {
    console.error("[kyc:uploadDocument]", err.message);
    return res.status(500).json({ error: "Upload failed: " + err.message });
  }
}

/** DELETE /api/field/kyc/documents/:id  OR  DELETE /api/client/kyc/documents/:id */
async function deleteDocument(req, res) {
  try {
    // FIX: select storage_path (not file_path)
    const { data: doc } = await supabaseAdmin
      .from("kyc_documents")
      .select("id, storage_path, kyc_submissions(status)")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (!doc) return res.status(404).json({ error: "Document not found." });

    const subStatus = doc.kyc_submissions?.status;
    if (!["draft", "rejected"].includes(subStatus))
      return res.status(409).json({ error: `KYC is "${subStatus}" — documents cannot be removed.` });

    // FIX: use storage_path
    await deleteFile(doc.storage_path);
    await supabaseAdmin.from("kyc_documents").delete().eq("id", req.params.id);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[kyc:deleteDocument]", err.message);
    return res.status(500).json({ error: "Delete failed." });
  }
}

/** PATCH /api/field/kyc/submit  OR  PATCH /api/client/kyc/submit */
async function submitKyc(req, res) {
  try {
    const { data: sub } = await supabaseAdmin
      .from("kyc_submissions").select("*").eq("user_id", req.user.id).maybeSingle();
    if (!sub)
      return res.status(400).json({ error: "Upload at least one document before submitting." });
    if (sub.status === "pending")
      return res.status(409).json({ error: "KYC is already under review." });
    if (sub.status === "approved")
      return res.status(409).json({ error: "KYC is already approved." });
    if (!["draft", "rejected"].includes(sub.status))
      return res.status(409).json({ error: `Cannot submit from "${sub.status}" status.` });

    const { count } = await supabaseAdmin
      .from("kyc_documents")
      .select("id", { count: "exact", head: true })
      .eq("submission_id", sub.id);
    if (!count || count < 1)
      return res.status(400).json({ error: "Upload at least one document before submitting." });

    const { data: updated, error } = await supabaseAdmin
      .from("kyc_submissions")
      .update({ status: "pending", submitted_at: new Date().toISOString() })
      .eq("id", sub.id).select().single();
    if (error) throw error;

    // Notify admin about new KYC submission
    try {
      const { sendNotification } = require("../utils/notifications");
      await sendNotification({
        type: "kyc_submitted",
        recipientRole: "admin",
        title: "KYC Submission Awaiting Review",
        message: `A ${req.user.role} user submitted KYC documents for verification.`,
        metadata: { submissionId: sub.id, userId: req.user.id },
        channels: ["inapp", "email"],
      });
    } catch (_notifErr) { /* notifications are best-effort */ }

    return res.json({ submission: updated });
  } catch (err) {
    console.error("[kyc:submitKyc]", err.message);
    return res.status(500).json({ error: "Submission failed." });
  }
}

/** GET /api/field/kyc/documents/:id/url  — signed 10-min download URL */
async function getDocumentUrl(req, res) {
  try {
    // FIX: select storage_path (not file_path)
    const { data: doc } = await supabaseAdmin
      .from("kyc_documents")
      .select("storage_path, user_id, mime_type, file_name")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!doc) return res.status(404).json({ error: "Document not found." });

    if (req.user.role !== "admin" && doc.user_id !== req.user.id)
      return res.status(403).json({ error: "Access denied." });

    // Short-lived signed download token (10 min) served by /api/files/kyc/:token.
    // Path is same-origin through the frontend's /backend rewrite.
    const token = signDownloadToken(doc.storage_path, doc.mime_type, doc.file_name);
    return res.json({ url: `/backend/api/files/kyc/${token}` });
  } catch (err) {
    console.error("[kyc:getDocumentUrl]", err.message);
    return res.status(500).json({ error: "Failed to generate URL." });
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN HANDLERS
   ═══════════════════════════════════════════════════════════════ */

/** GET /api/admin/kyc */
async function adminListKyc(req, res) {
  try {
    const status   = ["pending","approved","rejected","draft"].includes(req.query.status) ? req.query.status : null;
    const role     = ["field","client"].includes(req.query.role) ? req.query.role : null;
    const page     = clamp(req.query.page, 1, 500, 1);
    const pageSize = clamp(req.query.page_size, 1, 50, 20);
    const offset   = (page - 1) * pageSize;

    let query = supabaseAdmin
      .from("kyc_submissions")
      .select("id, user_id, user_role, status, submitted_at, reviewed_at, rejection_reason", { count: "exact" });

    if (status) query = query.eq("status", status);
    if (role)   query = query.eq("user_role", role);

    const { data: submissions, count, error } = await query
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const userIds = (submissions ?? []).map(s => s.user_id);
    const profiles = await fetchProfilesMap(userIds);

    const docCounts = await Promise.all(
      (submissions ?? []).map(s =>
        supabaseAdmin
          .from("kyc_documents")
          .select("id", { count: "exact", head: true })
          .eq("submission_id", s.id)
          .then(r => ({ id: s.id, count: r.count ?? 0 }))
      )
    );
    const docCountMap = Object.fromEntries(docCounts.map(d => [d.id, d.count]));

    const items = (submissions ?? []).map(s => ({
      ...s,
      profile: profiles[s.user_id] ?? null,
      doc_count: docCountMap[s.id] ?? 0,
    }));

    return res.json({ submissions: items, total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error("[kyc:adminListKyc]", err.message);
    return res.status(500).json({ error: "Could not load KYC submissions." });
  }
}

/** GET /api/admin/kyc/:id */
async function adminGetKyc(req, res) {
  try {
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("kyc_submissions").select("*").eq("id", req.params.id).maybeSingle();
    if (subErr || !sub) return res.status(404).json({ error: "Submission not found." });

    const { data: docs } = await supabaseAdmin
      .from("kyc_documents")
      .select("id, doc_type, file_name, file_size, mime_type, uploaded_at")
      .eq("submission_id", sub.id)
      .order("uploaded_at", { ascending: true });

    const profiles = await fetchProfilesMap([sub.user_id]);

    return res.json({ submission: sub, documents: docs ?? [], profile: profiles[sub.user_id] ?? null });
  } catch (err) {
    console.error("[kyc:adminGetKyc]", err.message);
    return res.status(500).json({ error: "Could not load KYC submission." });
  }
}

/** PATCH /api/admin/kyc/:id/review  { action, rejection_reason? } */
async function adminReviewKyc(req, res) {
  try {
    const { action, rejection_reason } = req.body ?? {};
    if (!["approve", "reject"].includes(action))
      return res.status(400).json({ error: 'action must be "approve" or "reject".' });

    const { data: sub } = await supabaseAdmin
      .from("kyc_submissions").select("id, status, user_id, user_role").eq("id", req.params.id).maybeSingle();
    if (!sub) return res.status(404).json({ error: "Submission not found." });
    if (sub.status !== "pending")
      return res.status(409).json({ error: `Cannot review a submission in "${sub.status}" status.` });

    const reason = typeof rejection_reason === "string" ? rejection_reason.trim().slice(0, 500) : "";
    if (action === "reject" && !reason)
      return res.status(400).json({ error: "Provide a rejection reason." });

    const newStatus = action === "approve" ? "approved" : "rejected";
    const { data: updated, error } = await supabaseAdmin
      .from("kyc_submissions")
      .update({
        status:           newStatus,
        reviewed_at:      new Date().toISOString(),
        reviewed_by:      req.user.id,
        rejection_reason: action === "reject" ? reason : null,
      })
      .eq("id", req.params.id).select().single();
    if (error) throw error;

    // Notify the user about the KYC decision
    try {
      const { sendNotification } = require("../utils/notifications");
      const isApproved = action === "approve";
      await sendNotification({
        type: isApproved ? "kyc_approved" : "kyc_rejected",
        recipientUserId: sub.user_id,
        title: isApproved ? "KYC Verification Approved" : "KYC Verification Rejected",
        message: isApproved
          ? "Your KYC documents have been verified. You are now fully verified."
          : `Your KYC submission was rejected. Reason: ${reason}`,
        metadata: { submissionId: sub.id, action, reason: reason || null },
        channels: ["inapp", "email"],
      });
    } catch (_notifErr) { /* notifications are best-effort */ }

    return res.json({ submission: updated });
  } catch (err) {
    console.error("[kyc:adminReviewKyc]", err.message);
    return res.status(500).json({ error: "Review failed." });
  }
}

module.exports = {
  uploadMiddleware: _upload.single("file"),
  getMyKyc,
  uploadDocument,
  deleteDocument,
  submitKyc,
  getDocumentUrl,
  adminListKyc,
  adminGetKyc,
  adminReviewKyc,
};
