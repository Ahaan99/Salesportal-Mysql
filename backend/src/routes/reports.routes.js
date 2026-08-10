const { Router } = require("express");
    const { requireAuth, requireRole } = require("../middleware/auth");
    const {
    adminSummary,
    adminSalesTrend,
    adminTopOfficers,
    adminKycStats,
    adminCommissionSummary,
    fieldMyReports,
    } = require("../controllers/reports.controller");

    const adminRouter = Router();
    adminRouter.use(requireAuth, requireRole("admin"));
    adminRouter.get("/summary",             adminSummary);
    adminRouter.get("/sales-trend",         adminSalesTrend);
    adminRouter.get("/top-officers",        adminTopOfficers);
    adminRouter.get("/kyc-stats",           adminKycStats);
    adminRouter.get("/commission-summary",  adminCommissionSummary);

    const fieldRouter = Router();
    fieldRouter.use(requireAuth, requireRole("field"));
    fieldRouter.get("/",  fieldMyReports);

    module.exports = { adminRouter, fieldRouter };
    