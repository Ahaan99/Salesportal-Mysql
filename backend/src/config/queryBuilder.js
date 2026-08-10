// Supabase-js compatible query builder over mysql2.
// Supports the exact API surface used by this codebase:
// from/select(+embedded rels, count, head)/insert/update/upsert/delete/
// eq/neq/gt/gte/lt/lte/in/ilike/is/or/order/limit/range/single/maybeSingle.
// Returns { data, error, count } like supabase-js. Thenable (awaitable).
const crypto = require("crypto");
const { pool } = require("./db");
const U = require("./sqlUtil");

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._action = "select";
    this._select = "*";
    this._countMode = null;
    this._head = false;
    this._filters = []; // { sql, params }
    this._orders = [];
    this._limit = null;
    this._offset = null;
    this._single = false;
    this._maybe = false;
    this._payload = null;
    this._returning = false;
    this._onConflict = null;
  }

  select(sel, opts) {
    if (this._action === "select") {
      this._select = sel || "*";
    } else {
      this._returning = true;
      this._select = sel || "*";
    }
    if (opts && opts.count) this._countMode = opts.count;
    if (opts && opts.head) this._head = true;
    return this;
  }
  insert(payload) { this._action = "insert"; this._payload = payload; return this; }
  update(payload) { this._action = "update"; this._payload = payload; return this; }
  upsert(payload, opts) {
    this._action = "upsert"; this._payload = payload;
    if (opts && opts.onConflict) this._onConflict = opts.onConflict;
    return this;
  }
  delete() { this._action = "delete"; return this; }

  _f(sql, params, col) { this._filters.push({ sql, params, col }); return this; }
  eq(c, v) { return this._f(`${U.ident(c)} = ?`, [U.serializeValue(v)], c); }
  neq(c, v) { return this._f(`${U.ident(c)} <> ?`, [U.serializeValue(v)]); }
  gt(c, v) { return this._f(`${U.ident(c)} > ?`, [U.serializeValue(v)]); }
  gte(c, v) { return this._f(`${U.ident(c)} >= ?`, [U.serializeValue(v)]); }
  lt(c, v) { return this._f(`${U.ident(c)} < ?`, [U.serializeValue(v)]); }
  lte(c, v) { return this._f(`${U.ident(c)} <= ?`, [U.serializeValue(v)]); }
  ilike(c, v) { return this._f(`${U.ident(c)} LIKE ?`, [String(v).replace(/\*/g, "%")]); }
  like(c, v) { return this.ilike(c, v); }
  is(c, v) { return this._f(v === null ? `${U.ident(c)} IS NULL` : `${U.ident(c)} IS NOT NULL`, []); }
  in(c, arr) {
    const a = Array.isArray(arr) ? arr : [];
    if (a.length === 0) return this._f("1=0", []);
    return this._f(`${U.ident(c)} IN (${a.map(() => "?").join(",")})`, a.map(U.serializeValue));
  }
  or(str) { const p = U.parseOrString(str); return this._f(p.sql, p.params); }
  not(c, op, v) {
    if (op === "is" && v === null) return this._f(`${U.ident(c)} IS NOT NULL`, []);
    return this._f(`NOT (${U.ident(c)} = ?)`, [U.serializeValue(v)]);
  }
  order(c, opts) {
    const asc = !opts || opts.ascending !== false;
    this._orders.push(`${U.ident(c)} ${asc ? "ASC" : "DESC"}`);
    return this;
  }
  limit(n) { this._limit = Number(n); return this; }
  range(from, to) { this._offset = Number(from); this._limit = Number(to) - Number(from) + 1; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybe = true; return this; }

  then(resolve, reject) { return this._run().then(resolve, reject); }
  catch(fn) { return this._run().catch(fn); }

  _where() {
    if (!this._filters.length) return { sql: "", params: [] };
    return {
      sql: " WHERE " + this._filters.map((f) => f.sql).join(" AND "),
      params: this._filters.flatMap((f) => f.params),
    };
  }

  _finish(rows, count) {
    let data = rows.map(U.rowOut);
    if (this._single) {
      if (data.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: `Expected 1 row, got ${data.length}` }, count: count ?? null };
      }
      data = data[0];
    } else if (this._maybe) {
      if (data.length > 1) {
        return { data: null, error: { code: "PGRST116", message: `Expected at most 1 row, got ${data.length}` }, count: count ?? null };
      }
      data = data[0] ?? null;
    }
    return { data, error: null, count: count ?? null };
  }

  async _run() {
    try {
      // Wallet sync (replaces Postgres trigger): capture affected officer ids
      // for any commissions mutation, then resync wallets afterwards.
      let walletOfficers = null;
      if (this.table === "commissions" && this._action !== "select") {
        walletOfficers = await this._affectedOfficerIds();
      }
      let result;
      switch (this._action) {
        case "select": result = await this._runSelect(); break;
        case "insert": result = await this._runInsert(); break;
        case "update": result = await this._runUpdate(); break;
        case "upsert": result = await this._runUpsert(); break;
        case "delete": result = await this._runDelete(); break;
        default: throw new Error("Unknown action " + this._action);
      }
      if (walletOfficers && walletOfficers.length && !result.error) {
        const { syncWallet } = require("../services/wallet");
        for (const oid of walletOfficers) await syncWallet(oid);
      }
      return result;
    } catch (err) {
      return { data: null, error: { message: err.message, code: err.code || "MYSQL_ERROR" }, count: null };
    }
  }

  async _affectedOfficerIds() {
    const ids = new Set();
    const rowsIn = Array.isArray(this._payload) ? this._payload : this._payload ? [this._payload] : [];
    for (const r of rowsIn) if (r && r.officer_id) ids.add(r.officer_id);
    if (this._action === "update" || this._action === "delete") {
      const w = this._where();
      try {
        const [rows] = await pool.query(`SELECT DISTINCT officer_id FROM \`commissions\`${w.sql}`, w.params);
        for (const r of rows) if (r.officer_id) ids.add(r.officer_id);
      } catch (_) { /* best-effort */ }
    }
    return [...ids];
  }

  async _runSelect() {
    const t = U.ident(this.table);
    const w = this._where();
    let count = null;
    if (this._countMode) {
      const [cr] = await pool.query(`SELECT COUNT(*) AS c FROM ${t}${w.sql}`, w.params);
      count = cr[0].c;
    }
    if (this._head) return { data: null, error: null, count };

    const parsed = U.parseSelect(this._select);
    const relDefs = U.REL_MAP[this.table] || {};
    // ensure local keys for embedded one-relations are fetched
    const hidden = [];
    for (const e of parsed.embeds) {
      const def = relDefs[e.name];
      if (def && def.kind === "one" && !parsed.cols.includes("*") && !parsed.cols.includes(def.localKey)) {
        hidden.push(def.localKey);
      }
    }
    // base "id" needed for many-relations
    for (const e of parsed.embeds) {
      const def = relDefs[e.name];
      if (def && def.kind === "many" && !parsed.cols.includes("*") && !parsed.cols.includes("id")) {
        hidden.push("id");
      }
    }
    const selCols = parsed.cols.map(U.colSql).concat(hidden.map(U.ident)).join(", ");
    let sql = `SELECT ${selCols} FROM ${t}${w.sql}`;
    if (this._orders.length) sql += " ORDER BY " + this._orders.join(", ");
    if (this._limit != null) sql += ` LIMIT ${this._limit}`;
    if (this._offset != null) sql += ` OFFSET ${this._offset}`;
    const [rows] = await pool.query(sql, w.params);

    // stitch embedded relations
    for (const e of parsed.embeds) {
      const def = relDefs[e.name];
      if (!def) { for (const r of rows) r[e.name] = null; continue; }
      const relCols = e.cols === "*" ? "*" : U.parseSelect(e.cols).cols.map(U.colSql).join(", ");
      if (def.kind === "one") {
        const keys = [...new Set(rows.map((r) => r[def.localKey]).filter(Boolean))];
        let relRows = [];
        if (keys.length) {
          const [rr] = await pool.query(
            `SELECT ${relCols === "*" ? "*" : relCols + ", `id`"} FROM ${U.ident(e.name)} WHERE \`id\` IN (${keys.map(() => "?").join(",")})`,
            keys
          );
          relRows = rr;
        }
        const byId = Object.fromEntries(relRows.map((r) => [r.id, r]));
        for (const r of rows) {
          const rel = byId[r[def.localKey]] || null;
          r[e.name] = rel ? U.rowOut(rel) : null;
        }
      } else {
        const ids = [...new Set(rows.map((r) => r.id).filter(Boolean))];
        let relRows = [];
        if (ids.length) {
          const [rr] = await pool.query(
            `SELECT ${relCols === "*" ? "*" : relCols + ", " + U.ident(def.fk)} FROM ${U.ident(e.name)} WHERE ${U.ident(def.fk)} IN (${ids.map(() => "?").join(",")})`,
            ids
          );
          relRows = rr;
        }
        const grouped = {};
        for (const r of relRows) (grouped[r[def.fk]] ||= []).push(U.rowOut(r));
        for (const r of rows) r[e.name] = grouped[r.id] || [];
      }
    }
    // strip hidden helper cols (after ALL embeds are stitched — an earlier
    // strip inside the loop would delete keys a later embed still needs)
    for (const h of hidden) for (const r of rows) if (!parsed.cols.includes(h)) delete r[h];
    return this._finish(rows, count);
  }

  async _runInsert() {
    const rowsIn = Array.isArray(this._payload) ? this._payload : [this._payload];
    if (!rowsIn.length) return { data: [], error: null, count: null };
    const ids = [];
    const prepared = rowsIn.map((r) => {
      const row = { ...r };
      if (!U.NO_AUTO_ID.has(this.table) && row.id === undefined) row.id = crypto.randomUUID();
      if (row.id !== undefined) ids.push(row.id);
      const out = {};
      for (const k of Object.keys(row)) out[k] = U.serializeValue(row[k]);
      return out;
    });
    const cols = [...new Set(prepared.flatMap((r) => Object.keys(r)))];
    const placeholders = prepared.map(() => "(" + cols.map(() => "?").join(",") + ")").join(",");
    const params = prepared.flatMap((r) => cols.map((c) => (r[c] === undefined ? null : r[c])));
    const [res] = await pool.query(
      `INSERT INTO ${U.ident(this.table)} (${cols.map(U.ident).join(",")}) VALUES ${placeholders}`,
      params
    );
    if (!this._returning) return { data: null, error: null, count: null };
    let sel;
    if (ids.length) {
      sel = await pool.query(
        `SELECT * FROM ${U.ident(this.table)} WHERE \`id\` IN (${ids.map(() => "?").join(",")})`, ids
      );
    } else if (res.insertId) {
      sel = await pool.query(`SELECT * FROM ${U.ident(this.table)} WHERE \`id\` = ?`, [res.insertId]);
    } else {
      return { data: null, error: null, count: null };
    }
    return this._finish(sel[0], null);
  }

  async _runUpdate() {
    const w = this._where();
    const payload = {};
    for (const k of Object.keys(this._payload)) payload[k] = U.serializeValue(this._payload[k]);
    const cols = Object.keys(payload);
    if (!cols.length) return { data: null, error: null, count: null };
    const setSql = cols.map((c) => `${U.ident(c)} = ?`).join(", ");
    const [res] = await pool.query(
      `UPDATE ${U.ident(this.table)} SET ${setSql}${w.sql}`,
      [...cols.map((c) => payload[c]), ...w.params]
    );
    if (!this._returning) return { data: null, error: null, count: null };
    // Re-select EXCLUDING filters on columns the update just changed.
    // e.g. .update({status:'rejected'}).eq('id',x).eq('status','review') -
    // after the update status is no longer 'review', so re-selecting with the
    // original WHERE returned nothing and callers misread it as a conflict.
    const updated = new Set(cols);
    const keep = this._filters.filter((f) => !f.col || !updated.has(f.col));
    const wSel = keep.length
      ? { sql: " WHERE " + keep.map((f) => f.sql).join(" AND "), params: keep.flatMap((f) => f.params) }
      : w; // nothing safe to filter on - fall back to the original WHERE
    if (!res.affectedRows) {
      // No row changed: either no match (conflict) or values were identical.
      const [same] = await pool.query(`SELECT * FROM ${U.ident(this.table)}${w.sql}`, w.params);
      return this._finish(same, null);
    }
    const [rows] = await pool.query(`SELECT * FROM ${U.ident(this.table)}${wSel.sql}`, wSel.params);
    return this._finish(rows, null);
  }

  async _runUpsert() {
    const rowsIn = Array.isArray(this._payload) ? this._payload : [this._payload];
    if (!rowsIn.length) return { data: [], error: null, count: null };
    const prepared = rowsIn.map((r) => {
      const row = { ...r };
      const out = {};
      for (const k of Object.keys(row)) out[k] = U.serializeValue(row[k]);
      return out;
    });
    const cols = [...new Set(prepared.flatMap((r) => Object.keys(r)))];
    const placeholders = prepared.map(() => "(" + cols.map(() => "?").join(",") + ")").join(",");
    const params = prepared.flatMap((r) => cols.map((c) => (r[c] === undefined ? null : r[c])));
    const updates = cols.map((c) => `${U.ident(c)} = new_vals.${U.ident(c)}`).join(", ");
    await pool.query(
      `INSERT INTO ${U.ident(this.table)} (${cols.map(U.ident).join(",")}) VALUES ${placeholders} AS new_vals ON DUPLICATE KEY UPDATE ${updates}`,
      params
    );
    if (!this._returning) return { data: null, error: null, count: null };
    const key = this._onConflict || (U.NO_AUTO_ID.has(this.table) ? "user_id" : "id");
    const keyVals = rowsIn.map((r) => r[key]).filter((v) => v !== undefined);
    if (!keyVals.length) return { data: null, error: null, count: null };
    const [rows] = await pool.query(
      `SELECT * FROM ${U.ident(this.table)} WHERE ${U.ident(key)} IN (${keyVals.map(() => "?").join(",")})`,
      keyVals
    );
    return this._finish(rows, null);
  }

  async _runDelete() {
    const w = this._where();
    await pool.query(`DELETE FROM ${U.ident(this.table)}${w.sql}`, w.params);
    return { data: null, error: null, count: null };
  }
}

module.exports = { QueryBuilder };
