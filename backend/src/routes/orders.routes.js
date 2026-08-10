const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  listOrders,
  orderSummary,
  updateOrder,
} = require("../controllers/orders.controller");

const router = Router();

router.use(requireAuth, requireRole("client"));

router.get("/", listOrders);
router.get("/summary", orderSummary);
router.patch("/:id", updateOrder);

module.exports = router;
