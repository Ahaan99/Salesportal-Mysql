#!/usr/bin/env node
/**
 * Admin bootstrap — the only supported way to create a Super Admin account
 * (public signup no longer accepts the admin role).
 *
 * Usage: set ADMIN_EMAIL / ADMIN_PASSWORD (and optionally ADMIN_NAME) in
 * backend/.env or the environment, then:  node db/create-admin.js
 *
 * Idempotent — an existing account with the same email is treated as success
 * (its role is upgraded to admin if needed).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { supabaseAdmin } = require("../src/config/supabase");

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = (process.env.ADMIN_NAME || "Recruweb HQ").trim();

  if (!email || !password) {
    console.error(
      "[create-admin] Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env (ADMIN_NAME optional)."
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("[create-admin] ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, role: "admin" },
  });

  if (!error) {
    console.log(`[create-admin] ✓ Admin created: ${email} (${data.user.id})`);
    return;
  }

  const exists =
    error.code === "email_exists" || /already.*registered|already.*exists/i.test(error.message);
  if (!exists) {
    console.error("[create-admin] Failed:", error.code, error.message);
    process.exit(1);
  }

  // Account already exists — make sure it actually has the admin role.
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) {
    console.error("[create-admin] Exists, but lookup failed:", listErr.message);
    process.exit(1);
  }
  const user = list.users.find((u) => (u.email || "").toLowerCase() === email);
  if (!user) {
    console.error("[create-admin] Exists, but could not locate the account to verify its role.");
    process.exit(1);
  }
  if (user.user_metadata?.role === "admin") {
    console.log(`[create-admin] ✓ Admin already exists: ${email} (${user.id})`);
    return;
  }
  // Take FULL ownership of the account: role, name AND password. If the
  // email was ever registered by someone else before signup reserved it,
  // upgrading without resetting the password would hand admin access to
  // whoever set the original password. ADMIN_PASSWORD is authoritative.
  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { ...user.user_metadata, role: "admin", full_name: name },
  });
  if (updErr) {
    console.error("[create-admin] Exists, but role upgrade failed:", updErr.message);
    process.exit(1);
  }
  console.log(`[create-admin] ✓ Existing account upgraded to admin: ${email} (${user.id})`);
}

main().catch((e) => {
  console.error("[create-admin] FATAL:", e.message);
  process.exit(1);
});
