const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  getMyProducts,
  adjustStock,
  getStockAdjustments,
} = require("../controllers/catalog.controller");

const router = Router();

// Category taxonomy is public reference data (still behind the API).
router.get("/categories", getCategories);

// Product CRUD requires an authenticated vendor. Ownership is enforced
// inside each controller (owner_id scoping on every query).
router.get("/products", requireAuth, requireRole("client"), getMyProducts);
router.post("/products", requireAuth, requireRole("client"), createProduct);
router.patch("/products/:id", requireAuth, requireRole("client"), updateProduct);
router.delete("/products/:id", requireAuth, requireRole("client"), deleteProduct);

// Inventory: stock adjustments with an audit trail (owner-scoped).
router.post("/products/:id/stock", requireAuth, requireRole("client"), adjustStock);
router.get("/stock-adjustments", requireAuth, requireRole("client"), getStockAdjustments);

module.exports = router;
