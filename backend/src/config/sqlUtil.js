// Helpers shared by the supabase-compat query builder (MySQL edition).
const RESERVED = new Set(["read"]);

// Known relationships for embedded selects like "*, leads(shop_name)".
// kind "one": base table has localKey -> rel.id (returns object)
// kind "many": rel table has fk -> base.id (returns array)
const REL_MAP = {
  commissions: { orders: { kind: "one", localKey: "order_id" } },
  returns: {
    orders: { kind: "one", localKey: "order_id" },
    refunds: { kind: "many", fk: "return_id" },
  },
  refunds: {
    returns: { kind: "one", localKey: "return_id" },
    orders: { kind: "one", localKey: "order_id" },
  },
  orders: { products: { kind: "one", localKey: "product_id" } },
  products: { categories: { kind: "one", localKey: "category_id" } },
  lead_follow_ups: { leads: { kind: "one", localKey: "lead_id" } },
  crm_tasks: { leads: { kind: "one", localKey: "lead_id" } },
  meetings: { leads: { kind: "one", localKey: "lead_id" } },
  leads: {
    lead_follow_ups: { kind: "many", fk: "lead_id" },
    lead_notes: { kind: "many", fk: "lead_id" },
  },
  kyc_documents: { kyc_submissions: { kind: "one", localKey: "submission_id" } },
};

// Tables whose PK is not an app-generated uuid `id`.
const NO_AUTO_ID = new Set(["categories", "profiles", "notification_settings", "officer_wallets"]);

function ident(name) {
  const clean = String(name).replace(/[^a-zA-Z0-9_]/g, "");
  return "`" + clean + "`";
}

function colSql(col) {
  if (col === "*") return "*";
  return ident(col);
}

// Split "a, b, rel(x, y), c" respecting parentheses.
function splitTopLevel(sel) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// Parse a select string into { cols: string[], embeds: [{name, alias, cols}] }
// Supports supabase alias syntax for embeds: "category:categories(name)".
function parseSelect(sel) {
  const cols = [];
  const embeds = [];
  for (const part of splitTopLevel(sel || "*")) {
    const m = part.match(/^(?:([a-zA-Z0-9_]+)\s*:\s*)?([a-zA-Z0-9_]+)\s*\((.*)\)$/s);
    if (m) {
      embeds.push({ name: m[2], alias: m[1] || m[2], cols: m[3].trim() || "*" });
    } else {
      cols.push(part);
    }
  }
  if (cols.length === 0) cols.push("*");
  return { cols, embeds };
}

// ISO 8601 datetime string, e.g. "2026-08-06T06:46:15.845Z" or with ±hh:mm offset.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

// MySQL DATETIME doesn't accept the "T" separator + "Z"/offset suffix in
// strict mode. Convert to "YYYY-MM-DD HH:MM:SS.mmm" in UTC (matches how the
// schema stores timestamps — UTC_TIMESTAMP(3)).
function toMysqlDateTime(d) {
  return d.toISOString().slice(0, 23).replace("T", " ");
}

function serializeValue(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (v instanceof Date) return toMysqlDateTime(v);
  if (typeof v === "string" && ISO_DATETIME_RE.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return toMysqlDateTime(d);
  }
  if (Array.isArray(v) || (typeof v === "object")) return JSON.stringify(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

function toOut(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function rowOut(row) {
  if (!row) return row;
  const o = {};
  for (const k of Object.keys(row)) o[k] = toOut(row[k]);
  return o;
}

// Parse supabase .or() string: "name.ilike.%x%,brand.ilike.%x%"
// Returns { sql, params }
function parseOrString(str) {
  const clauses = [];
  const params = [];
  for (const seg of splitTopLevel(str)) {
    const m = seg.match(/^([a-zA-Z0-9_]+)\.(eq|neq|ilike|like|gt|gte|lt|lte|is)\.(.*)$/s);
    if (!m) continue;
    const [, col, op, raw] = m;
    const c = ident(col);
    if (op === "is") {
      clauses.push(raw === "null" ? `${c} IS NULL` : `${c} IS NOT NULL`);
    } else if (op === "ilike" || op === "like") {
      clauses.push(`${c} LIKE ?`);
      params.push(raw.replace(/\*/g, "%"));
    } else {
      const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
      clauses.push(`${c} ${OPS[op]} ?`);
      params.push(raw);
    }
  }
  return { sql: clauses.length ? "(" + clauses.join(" OR ") + ")" : "1=1", params };
}

module.exports = {
  REL_MAP,
  NO_AUTO_ID,
  RESERVED,
  ident,
  colSql,
  splitTopLevel,
  parseSelect,
  serializeValue,
  toOut,
  rowOut,
  parseOrString,
};
