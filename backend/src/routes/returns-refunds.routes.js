const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  createReturn,
  listReturns,
  getReturn,
  updateReturn,
  cancelReturn,
} = require("../controllers/returns.controller");
const {
  createRefund,
  listRefunds,
  getRefund,
  updateRefundStatus,
} = require("../controllers/refunds.controller");

const router = express.Router();

// ========== RETURNS ENDPOINTS ==========

// List all returns for the authenticated client
router.get("/returns", requireAuth, listReturns);

// Get a specific return
router.get("/returns/:id", requireAuth, getReturn);

// Create a new return request
router.post("/returns", requireAuth, createReturn);

// Update return (client can update notes/status for pending returns)
router.patch("/returns/:id", requireAuth, updateReturn);

// Cancel (delete) a pending return - owner only
router.delete("/returns/:id", requireAuth, cancelReturn);

// ========== REFUNDS ENDPOINTS ==========

// List all refunds for the authenticated client
router.get("/refunds", requireAuth, listRefunds);

// Get a specific refund
router.get("/refunds/:id", requireAuth, getRefund);

// Create a refund for an approved return (admin operation)
router.post("/refunds", requireAuth, requireRole("admin"), createRefund);

// Update refund status (admin operation - mark as processing/completed/failed)
router.patch("/refunds/:id/status", requireAuth, requireRole("admin"), updateRefundStatus);

module.exports = router;
