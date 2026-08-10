const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../middleware/auth");
const { chatWithAssistant } = require("../controllers/assistant.controller");

const router = express.Router();

// Tighter limit than the global /api limiter — each call hits the Gemini API.
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Behind the Next.js proxy + Cloudflare tunnel every request shares one IP,
  // so key by the authenticated user instead - otherwise one user's usage
  // rate-limits everybody.
  keyGenerator: (req) => req.user?.sub || req.ip,
  message: { error: "Too many assistant requests. Please wait a moment." },
});

// Any signed-in user (client, field, admin) can use the assistant.
// requireAuth runs first so the limiter can key by user id.
router.post("/chat", requireAuth, assistantLimiter, chatWithAssistant);

module.exports = router;
