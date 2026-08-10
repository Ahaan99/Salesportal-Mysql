const { Router } = require("express");
    const { requireAuth, requireRole } = require("../middleware/auth");
    const {
    getProfile,
    upsertProfile,
    listProducts,
    createOrder,
    listMyOrders,
    getSummary,
    getPerformance,
    listCommissions,
    getLeaderboard,
    } = require("../controllers/field.controller");
    const { submitSale, listMySales } = require("../controllers/sales.controller");
    const { getMyWallet, requestPayout } = require("../controllers/commission.controller");
    const {
    uploadMiddleware,
    getMyKyc,
    uploadDocument,
    deleteDocument,
    submitKyc,
    getDocumentUrl,
    } = require("../controllers/kyc.controller");

    const router = Router();

    router.use(requireAuth, requireRole("field"));

    // Profile
    router.get("/profile",     getProfile);
    router.put("/profile",     upsertProfile);

    // Catalogue
    router.get("/products",    listProducts);

    // Orders (legacy direct-placement path)
    router.get("/orders",      listMyOrders);
    router.post("/orders",     createOrder);

    // Dashboard metrics
    router.get("/summary",     getSummary);
    router.get("/performance", getPerformance);
    router.get("/commissions", listCommissions);
    router.get("/leaderboard", getLeaderboard);

    // Sales submission & verification workflow
    router.get("/sales",       listMySales);
    router.post("/sales",      submitSale);

    // Wallet & payouts
    router.get("/wallet",          getMyWallet);
    router.post("/wallet/payout",  requestPayout);

    // KYC — document verification
    // GET  /api/field/kyc/me                      — load my submission + docs
    // POST /api/field/kyc/documents               — upload a document (multipart)
    // DELETE /api/field/kyc/documents/:id         — remove a document
    // PATCH /api/field/kyc/submit                 — submit for admin review
    // GET  /api/field/kyc/documents/:id/url       — signed download URL
    router.get("/kyc/me",                   getMyKyc);
    router.post("/kyc/documents",           uploadMiddleware, uploadDocument);
    router.delete("/kyc/documents/:id",     deleteDocument);
    router.patch("/kyc/submit",             submitKyc);
    router.get("/kyc/documents/:id/url",    getDocumentUrl);

    module.exports = router;
    