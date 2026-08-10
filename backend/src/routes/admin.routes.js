const { Router } = require("express");
    const { requireAuth, requireRole } = require("../middleware/auth");
    const {
    listProducts,
    getProductCounts,
    reviewProduct,
    } = require("../controllers/admin.controller");
    const {
    listPendingSales,
    reviewSale,
    getAdminKpis,
    } = require("../controllers/sales.controller");
    const {
    listAllCommissions,
    getCommissionSummary,
    updateCommissionStatus,
    listPayoutRequests,
    reviewPayoutRequest,
    } = require("../controllers/commission.controller");
    const {
    adminListKyc,
    adminGetKyc,
    adminReviewKyc,
    } = require("../controllers/kyc.controller");
    const {
    adminOverview,
    adminClients,
    adminOfficers,
    } = require("../controllers/overview.controller");

    const router = Router();

    // Every admin endpoint requires an authenticated super admin.
    router.use(requireAuth, requireRole("admin"));

    // Product moderation queue
    router.get("/products",              listProducts);
    router.get("/products/counts",       getProductCounts);
    router.patch("/products/:id/review", reviewProduct);

    // Sales verification queue
    router.get("/sales",               listPendingSales);
    router.patch("/sales/:id/review",  reviewSale);

    // Dashboard KPIs
    router.get("/kpis",                getAdminKpis);

    // Live dashboard overview + user directories
    router.get("/overview",            adminOverview);
    router.get("/clients-overview",    adminClients);
    router.get("/officers-overview",   adminOfficers);

    // Commission management
    router.get("/commissions/summary",          getCommissionSummary);
    router.get("/commissions",                  listAllCommissions);
    router.patch("/commissions/:id/status",     updateCommissionStatus);

    // Payout requests
    router.get("/commissions/payouts",               listPayoutRequests);
    router.patch("/commissions/payouts/:id/review",  reviewPayoutRequest);

    // KYC — document verification
    // GET   /api/admin/kyc                    — list all submissions (with filters)
    // GET   /api/admin/kyc/:id                — get one submission + docs
    // PATCH /api/admin/kyc/:id/review         — approve or reject
    router.get("/kyc",               adminListKyc);
    router.get("/kyc/:id",           adminGetKyc);
    router.patch("/kyc/:id/review",  adminReviewKyc);

    module.exports = router;
    