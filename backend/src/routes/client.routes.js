const { Router } = require("express");
    const { requireAuth, requireRole } = require("../middleware/auth");
    const {
    uploadMiddleware,
    getMyKyc,
    uploadDocument,
    deleteDocument,
    submitKyc,
    getDocumentUrl,
    } = require("../controllers/kyc.controller");
    const { clientOverview } = require("../controllers/overview.controller");

    const router = Router();
    router.use(requireAuth, requireRole("client"));

    // Live dashboard overview (scoped to the authenticated client)
    router.get("/overview", clientOverview);

    // KYC for client / vendor users
    router.get("/kyc/me",               getMyKyc);
    router.post("/kyc/documents",       uploadMiddleware, uploadDocument);
    router.delete("/kyc/documents/:id", deleteDocument);
    router.patch("/kyc/submit",         submitKyc);
    router.get("/kyc/documents/:id/url", getDocumentUrl);

    module.exports = router;
    