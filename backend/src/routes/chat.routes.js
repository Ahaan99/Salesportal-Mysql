const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  getMyThread,
  getMyThreadSummary,
  postMyMessage,
  adminListThreads,
  adminGetThread,
  adminPostMessage,
} = require("../controllers/chat.controller");

const router = express.Router();

// ---- Participant (vendor client / field officer) ----
router.get("/thread", requireAuth, requireRole("client", "field"), getMyThread);
router.get("/thread/summary", requireAuth, requireRole("client", "field"), getMyThreadSummary);
router.post("/messages", requireAuth, requireRole("client", "field"), postMyMessage);

// ---- Admin inbox ----
router.get("/threads", requireAuth, requireRole("admin"), adminListThreads);
router.get("/threads/:id", requireAuth, requireRole("admin"), adminGetThread);
router.post("/threads/:id/messages", requireAuth, requireRole("admin"), adminPostMessage);

module.exports = router;
