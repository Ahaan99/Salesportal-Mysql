/**
 * Company profile — one row per vendor in public.company_profiles.
 * All access is owner-scoped (owner_id = req.user.id on every query).
 */
const { supabaseAdmin } = require("../config/supabase");

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;
const PHONE_RE = /^\+[1-9][0-9]{7,14}$/; // E.164

/** camelCase API field -> snake_case column */
const FIELD_MAP = {
  companyName: "company_name",
  legalName: "legal_name",
  tagline: "tagline",
  about: "about",
  contactName: "contact_name",
  email: "email",
  phone: "phone",
  website: "website",
  gstin: "gstin",
  pan: "pan",
  addressLine: "address_line",
  city: "city",
  state: "state",
  pincode: "pincode",
  bankName: "bank_name",
  accountNumber: "account_number",
  ifsc: "ifsc",
};

function toApiProfile(row, user) {
  const p = {};
  for (const [api, col] of Object.entries(FIELD_MAP)) p[api] = row?.[col] ?? "";
  p.categories = Array.isArray(row?.categories) ? row.categories : [];
  // Sensible default for a first-time profile: the account email.
  if (!row && user?.email) p.email = user.email;
  return p;
}

function validateProfile(body) {
  const raw = {};
  for (const key of Object.keys(FIELD_MAP)) {
    raw[key] = String(body?.[key] ?? "").trim().slice(0, key === "about" ? 2000 : 200);
  }
  raw.gstin = raw.gstin.toUpperCase();
  raw.pan = raw.pan.toUpperCase();
  raw.ifsc = raw.ifsc.toUpperCase();

  const errors = {};
  if (raw.companyName.length < 2) errors.companyName = "Company name is required.";
  if (raw.contactName.length < 2) errors.contactName = "Contact person is required.";
  if (!EMAIL_RE.test(raw.email)) errors.email = "Enter a valid email address.";
  if (!PHONE_RE.test(raw.phone)) errors.phone = "Enter a valid phone number.";
  if (raw.gstin && !GSTIN_RE.test(raw.gstin)) errors.gstin = "GSTIN format is invalid (e.g. 27AAECV4321F1Z5).";
  if (raw.pan && !PAN_RE.test(raw.pan)) errors.pan = "PAN format is invalid (e.g. AAECV4321F).";
  if (!raw.addressLine) errors.addressLine = "Address is required.";
  if (!raw.city) errors.city = "City is required.";
  if (!raw.state) errors.state = "State is required.";
  if (!PINCODE_RE.test(raw.pincode)) errors.pincode = "Enter a valid 6-digit PIN code.";
  if (raw.ifsc && !IFSC_RE.test(raw.ifsc)) errors.ifsc = "IFSC format is invalid (e.g. HDFC0001234).";
  if (raw.accountNumber && !/^[0-9]{9,18}$/.test(raw.accountNumber))
    errors.accountNumber = "Account number must be 9-18 digits.";
  if (raw.website && !/^https?:\/\/[^\s]+\.[^\s]+$/.test(raw.website))
    errors.website = "Website must be a valid URL starting with http(s)://";

  const categories = Array.isArray(body?.categories)
    ? body.categories.map((c) => String(c).trim().slice(0, 60)).filter(Boolean).slice(0, 20)
    : [];

  const row = { categories };
  for (const [api, col] of Object.entries(FIELD_MAP)) row[col] = raw[api];
  return { errors, row };
}

async function getMyProfile(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from("company_profiles")
      .select("*")
      .eq("owner_id", req.user.id)
      .maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { publicMessage: "Could not load your profile." });
    res.json({ profile: toApiProfile(data, req.user) });
  } catch (e) {
    next(e);
  }
}

async function saveMyProfile(req, res, next) {
  try {
    const { errors, row } = validateProfile(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: "Please fix the highlighted fields.", fields: errors });
    }

    const { data, error } = await supabaseAdmin
      .from("company_profiles")
      .upsert(
        { owner_id: req.user.id, ...row, updated_at: new Date().toISOString() },
        { onConflict: "owner_id" }
      )
      .select("*")
      .single();
    if (error) throw Object.assign(new Error(error.message), { publicMessage: "Could not save your profile." });

    res.json({ profile: toApiProfile(data, req.user) });
  } catch (e) {
    next(e);
  }
}

module.exports = { getMyProfile, saveMyProfile };
