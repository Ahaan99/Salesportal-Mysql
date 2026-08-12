/**
 * Public (unauthenticated) endpoints.
 * POST /api/public/join-applications — the "Join as seller" form.
 * Protected by the global /api rate limiter plus a strict local one.
 */
const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../config/db");

const router = Router();

const PHONE_RE = /^\+[1-9][0-9]{7,14}$/; // E.164
const CATEGORIES = new Set(["field", "independent"]);

router.post(
  "/join-applications",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many applications from this device. Try again later." },
  }),
  async (req, res, next) => {
    try {
      const category = String(req.body?.category ?? "");
      const name = String(req.body?.name ?? "").trim().slice(0, 200);
      const phone = String(req.body?.phone ?? "").trim();
      const city = String(req.body?.city ?? "").trim().slice(0, 200);

      const errors = {};
      if (!CATEGORIES.has(category)) errors.category = "Choose how you want to sell.";
      if (name.length < 2) errors.name = "Enter your full name.";
      if (!PHONE_RE.test(phone)) errors.phone = "Enter a valid phone number.";
      if (city.length < 2) errors.city = "Enter your city or area.";
      if (Object.keys(errors).length) {
        return res.status(422).json({ error: "Please fix the highlighted fields.", fields: errors });
      }

      // One pending application per phone — return the existing code instead of duplicating.
      const [existing] = await pool.query(
        "SELECT code FROM join_applications WHERE phone = ? AND status = 'pending' LIMIT 1",
        [phone]
      );
      if (existing.length) {
        return res.json({ code: existing[0].code, duplicate: true });
      }

      const prefix = category === "field" ? "FSO" : "IND";
      const [result] = await pool.query(
        "INSERT INTO join_applications (code, category, name, phone, city) VALUES (?, ?, ?, ?, ?)",
        [`${prefix}-PENDING`, category, name, phone, city]
      );
      const code = `${prefix}-${1000 + result.insertId}`;
      await pool.query("UPDATE join_applications SET code = ? WHERE id = ?", [code, result.insertId]);

      res.status(201).json({ code, duplicate: false });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
