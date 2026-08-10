// Local-disk file storage — replaces Supabase Storage for KYC documents.
//
// Files live under backend/uploads/kyc-docs/<userId>/<submissionId>/<docType>.<ext>
// (same relative paths as the old bucket, so existing storage_path values in
// the kyc_documents table keep working after the file migration).
//
// Downloads use short-lived signed URLs just like Supabase did:
//   signDownloadToken(path)  → JWT (10 min) embedding the storage path
//   GET /api/files/kyc/:token → streams the file if the token verifies
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const ROOT = path.resolve(__dirname, "../../uploads/kyc-docs");

/** Resolve a storage path safely inside ROOT (blocks ../ traversal). */
function resolveSafe(storagePath) {
  const cleaned = String(storagePath).replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(ROOT, cleaned);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
    throw new Error("Invalid storage path.");
  }
  return abs;
}

/** Write a buffer to local storage (upsert semantics — overwrites). */
async function saveFile(storagePath, buffer) {
  const abs = resolveSafe(storagePath);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buffer);
}

/** Delete a stored file; missing files are not an error. */
async function deleteFile(storagePath) {
  try {
    await fsp.unlink(resolveSafe(storagePath));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

/** Sign a 10-minute download token for a storage path. */
function signDownloadToken(storagePath, mimeType, fileName) {
  return jwt.sign(
    { p: storagePath, m: mimeType || null, f: fileName || null, kind: "kyc-dl" },
    JWT_SECRET,
    { expiresIn: "10m" }
  );
}

/**
 * Express handler: GET /api/files/kyc/:token
 * The token IS the authorization (like a Supabase signed URL) — it can only
 * be minted by getDocumentUrl, which enforces owner/admin access first.
 */
function downloadHandler(req, res) {
  let payload;
  try {
    payload = jwt.verify(req.params.token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Download link expired or invalid." });
  }
  if (payload.kind !== "kyc-dl" || !payload.p) {
    return res.status(400).json({ error: "Invalid download token." });
  }

  let abs;
  try {
    abs = resolveSafe(payload.p);
  } catch {
    return res.status(400).json({ error: "Invalid download token." });
  }
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ error: "File not found." });
  }

  if (payload.m) res.setHeader("Content-Type", payload.m);
  if (payload.f) {
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(payload.f).replace(/[^\w.\- ]/g, "_")}"`
    );
  }
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(abs).pipe(res);
}

module.exports = { saveFile, deleteFile, signDownloadToken, downloadHandler, ROOT };
